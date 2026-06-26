/**
 * POST /api/<empresa>/cxp/facturas/upload-xml — ingesta de facturas de egreso
 * desde XML CFDI (CxP Sprint 2, iniciativa `cxp`).
 *
 * Acepta 1..N archivos XML (campo `file` del FormData → bulk). Por cada uno:
 *   1. Parsea el CFDI (determinista, lib/cxp/cfdi-parser — sin LLM).
 *   2. Valida que el receptor del CFDI sea esta empresa (por RFC).
 *   3. Dedup por folio fiscal (uuid_sat).
 *   4. Matchea el emisor con un proveedor (persona por RFC); si no existe, la
 *      factura se crea igual con proveedor nulo y se sugiere el alta del
 *      proveedor (carga inclusiva — "mejor capturar de más", planning cxp).
 *   5. Da de alta la factura vía `erp.cxp_factura_alta` (RPC, dedup defensivo;
 *      recibe `p_usuario_id` para atribuir su audit_log — vía service role
 *      `auth.uid()` es NULL).
 *   6. Sube el XML a storage (`adjuntos`) + registra `erp.adjuntos` + `xml_url`.
 *
 * Auto-match destajo → CxP (S4, iniciativa dilesa-estimaciones-cxp): si el
 * emisor tiene una factura EN ESPERA (placeholder borrador con estimacion_id),
 * el CFDI se ASOCIA a ella (la promueve a por_pagar) en vez de duplicar.
 *   - `analyze=1` → devuelve por archivo la sugerencia (destajo o normal) +
 *     candidatos, SIN escribir. El uploader lo usa para el review.
 *   - `decisiones` (JSON filename→facturaId|'normal') → el commit asocia o crea
 *     según lo que confirmó el operador. Sin decisiones → todo se crea normal.
 *   - `factura_id` → recepción directa sobre una factura en espera (bandeja).
 *   Regla: la factura del contratista nunca debe ser MAYOR que el neto del
 *   destajo (puede ser menor por materiales descontados, solo informativo).
 *
 * Devuelve un resultado por archivo (éxito o error) para no abortar el lote
 * completo por un XML malo. Status: 200 todo cargado, 207 lote parcial,
 * 422 ningún archivo pasó (el body es idéntico en los tres casos).
 *
 * Audit trail server-side en `core.audit_log` (best-effort): una fila
 * `cxp_factura_rechazo` por archivo rechazado + una `cxp_facturas_upload_lote`
 * por lote. Sin esto, "subí facturas y no se guardaron" era indiagnosticable —
 * los rechazos solo vivían en el modal del cliente.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { buildAdjuntoPath, type EmpresaSlug } from '@/lib/storage/path';
import { parseCfdiXml, CfdiParseError } from '@/lib/cxp/cfdi-parser';
import type { Database } from '@/types/supabase';

const EMPRESA_SLUGS: EmpresaSlug[] = ['dilesa', 'rdb', 'ansa', 'coagan'];

type Params = { params: Promise<{ empresa: string }> };

type FacturaResult = {
  filename: string;
  ok: boolean;
  facturaId?: string;
  uuid?: string | null;
  proveedorId?: string | null;
  /** Si el emisor no matcheó un proveedor existente, se sugiere darlo de alta. */
  proveedorSugerido?: { rfc: string; nombre: string | null } | null;
  error?: string;
};

type AuditLogInsert = Database['core']['Tables']['audit_log']['Insert'];

// `p_usuario_id` existe desde la migración 20260612161552; types/supabase.ts
// se regenera cuando se aplique a prod — la intersección cubre el gap y queda
// redundante (inofensiva) después.
type CxpFacturaAltaArgs = Database['erp']['Functions']['cxp_factura_alta']['Args'] & {
  p_usuario_id?: string;
};

// ── Auto-match destajo → CxP (S4) ──────────────────────────────────────────
// Una factura EN ESPERA (placeholder borrador con estimacion_id) por contratista.

type DestajoPlaceholder = {
  facturaId: string;
  proveedorId: string | null;
  neto: number;
  estimacionId: string;
  codigo: string | null;
};

type DestajoCandidato = {
  facturaId: string;
  codigo: string | null;
  neto: number;
  /** materiales descontados = neto − CFDI (≥ 0, solo informativo). */
  delta: number;
};

type AnalisisArchivo = {
  filename: string;
  /** parseó + receptor correcto + no duplicada. */
  ok: boolean;
  error?: string;
  proveedorNombre: string | null;
  emisorRfc?: string;
  proveedorId?: string | null;
  total?: number;
  uuid?: string | null;
  /** ya existe una factura con ese folio fiscal. */
  yaCargada?: boolean;
  candidatos: DestajoCandidato[];
  /** facturaId del destajo sugerido, o 'normal'. */
  sugerencia: string;
};

const NETO_EPS = 1.005; // tolerancia de redondeo para "CFDI ≤ neto".

/** Destajos abiertos cuyo neto ≥ total del CFDI (puede ser menor por materiales), tightest primero. */
function candidatosParaCfdi(
  placeholders: DestajoPlaceholder[],
  proveedorId: string | null,
  total: number
): DestajoCandidato[] {
  if (!proveedorId) return [];
  return placeholders
    .filter((p) => p.proveedorId === proveedorId && total <= p.neto * NETO_EPS)
    .map((p) => ({
      facturaId: p.facturaId,
      codigo: p.codigo,
      neto: p.neto,
      delta: Math.max(0, p.neto - total),
    }))
    .sort((a, b) => a.neto - b.neto);
}

/** Sugerencia: el destajo de mejor encaje (tightest) si el CFDI no es muy menor; si no, factura normal. */
function sugerirAccion(candidatos: DestajoCandidato[], total: number): string {
  const tightest = candidatos[0];
  if (tightest && total >= tightest.neto * 0.8) return tightest.facturaId;
  return 'normal';
}

/** Carga las facturas en espera (placeholders de destajo) de la empresa, con código y neto. */
async function fetchDestajoPlaceholders(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  empresaId: string
): Promise<DestajoPlaceholder[]> {
  if (!admin) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facs } = await (admin.schema('erp') as any)
    .from('facturas')
    .select('id, proveedor_id, total, estimacion_id')
    .eq('empresa_id', empresaId)
    .eq('estado_cxp', 'borrador')
    .not('estimacion_id', 'is', null)
    .is('cancelada_at', null);
  const rows = (facs ?? []) as {
    id: string;
    proveedor_id: string | null;
    total: number | null;
    estimacion_id: string;
  }[];
  const estIds = [...new Set(rows.map((r) => r.estimacion_id))];
  const codigoPorEst = new Map<string, string>();
  if (estIds.length > 0) {
    const { data: ests } = await admin
      .schema('dilesa')
      .from('estimaciones')
      .select('id, codigo')
      .in('id', estIds);
    for (const e of ests ?? []) codigoPorEst.set(e.id as string, (e.codigo as string | null) ?? '');
  }
  return rows.map((r) => ({
    facturaId: r.id,
    proveedorId: r.proveedor_id,
    neto: Number(r.total ?? 0),
    estimacionId: r.estimacion_id,
    codigo: codigoPorEst.get(r.estimacion_id) ?? null,
  }));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { empresa: empresaSlug } = await params;
  if (!EMPRESA_SLUGS.includes(empresaSlug as EmpresaSlug)) {
    return NextResponse.json({ ok: false, error: 'Empresa inválida.' }, { status: 400 });
  }

  // Auth.
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Configuración de servidor incompleta.' },
      { status: 500 }
    );
  }

  // Resolver empresa por slug.
  const { data: emp } = await admin
    .schema('core')
    .from('empresas')
    .select('id, rfc, slug')
    .eq('slug', empresaSlug)
    .maybeSingle();
  if (!emp) {
    return NextResponse.json({ ok: false, error: 'Empresa no encontrada.' }, { status: 404 });
  }

  // Acceso: miembro activo de la empresa o admin global.
  const [{ data: u }, { data: mem }] = await Promise.all([
    admin.schema('core').from('usuarios').select('rol').eq('id', user.id).maybeSingle(),
    admin
      .schema('core')
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', user.id)
      .eq('empresa_id', emp.id)
      .eq('activo', true)
      .maybeSingle(),
  ]);
  if (!mem && u?.rol !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Sin acceso a esta empresa.' }, { status: 403 });
  }

  // Archivos (1..N).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Cuerpo inválido (se esperaba multipart).' },
      {
        status: 400,
      }
    );
  }
  const files = form.getAll('file').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No se adjuntaron archivos XML.' },
      {
        status: 400,
      }
    );
  }

  const empresaRfc = String(emp.rfc ?? '')
    .toUpperCase()
    .trim();

  // ── Camino RECEPCIÓN (destajo → CxP): un XML destinado a una factura EN
  // ESPERA específica (estado_cxp='borrador' con estimacion_id). En vez de
  // crear una factura nueva, asocia el CFDI a la existente y la promueve a
  // por_pagar (RPC cxp_factura_recibir_cfdi). Iniciativa dilesa-estimaciones-cxp.
  const facturaIdParam = form.get('factura_id');
  if (typeof facturaIdParam === 'string' && facturaIdParam.trim()) {
    const facturaId = facturaIdParam.trim();
    if (files.length !== 1) {
      return NextResponse.json(
        { ok: false, error: 'Sube exactamente un XML para esta factura.' },
        { status: 400 }
      );
    }
    const { data: fac } = await admin
      .schema('erp')
      .from('facturas')
      .select('id, empresa_id, estado_cxp, total, cancelada_at')
      .eq('id', facturaId)
      .maybeSingle();
    if (!fac || fac.empresa_id !== emp.id) {
      return NextResponse.json({ ok: false, error: 'Factura no encontrada.' }, { status: 404 });
    }

    let cfdi;
    try {
      cfdi = parseCfdiXml(await files[0].text());
    } catch (e) {
      const msg =
        e instanceof CfdiParseError ? e.message : `Error inesperado: ${(e as Error).message}`;
      return NextResponse.json({ ok: false, error: msg }, { status: 422 });
    }
    if (empresaRfc && cfdi.receptorRfc !== empresaRfc) {
      return NextResponse.json(
        {
          ok: false,
          error: `El CFDI es para el RFC ${cfdi.receptorRfc}, no para ${empresaSlug} (${empresaRfc}).`,
        },
        { status: 422 }
      );
    }

    // Regla del destajo: la factura nunca debe ser MAYOR que el neto (puede ser
    // menor por materiales descontados). Si excede, es probable error de captura.
    const netoEsperado = Number(fac.total ?? 0);
    if (netoEsperado > 0 && cfdi.total > netoEsperado * NETO_EPS) {
      return NextResponse.json(
        {
          ok: false,
          error: `La factura ($${cfdi.total.toLocaleString('es-MX')}) excede el neto del destajo ($${netoEsperado.toLocaleString('es-MX')}). La factura del contratista nunca debería ser mayor que el destajo — revisa el XML.`,
        },
        { status: 422 }
      );
    }

    // RPC aún no en types — mismo patrón de cast que el resto de CxP.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (admin.schema('erp') as any).rpc('cxp_factura_recibir_cfdi', {
      p_factura_id: facturaId,
      p_uuid_sat: cfdi.uuid ?? undefined,
      p_total: cfdi.total,
      p_subtotal: cfdi.subtotal,
      p_iva: cfdi.ivaTrasladado,
      p_fecha_emision: cfdi.fecha || undefined,
      p_emisor_rfc: cfdi.emisorRfc,
      p_emisor_nombre: cfdi.emisorNombre ?? undefined,
      p_receptor_rfc: cfdi.receptorRfc,
      p_forma_pago_sat: cfdi.formaPago ?? undefined,
      p_metodo_pago_sat:
        cfdi.metodoPago === 'PUE' || cfdi.metodoPago === 'PPD' ? cfdi.metodoPago : undefined,
      p_uso_cfdi: cfdi.usoCfdi ?? undefined,
      p_tasa_iva: cfdi.tasaIva ?? undefined,
      p_retencion_iva: cfdi.retencionIva,
      p_retencion_isr: cfdi.retencionIsr,
    });
    if (rpcErr) {
      return NextResponse.json(
        { ok: false, error: (rpcErr as { message: string }).message },
        { status: 422 }
      );
    }

    // Guardar el XML + registrar adjunto + xml_url (best-effort).
    const path = buildAdjuntoPath({
      empresa: empresaSlug as EmpresaSlug,
      entidad: 'facturas',
      entidadId: facturaId,
      filename: files[0].name,
    });
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('adjuntos')
      .upload(path, bytes, { contentType: 'application/xml', upsert: false });
    if (!upErr) {
      await admin.schema('erp').from('adjuntos').insert({
        empresa_id: emp.id,
        entidad_tipo: 'cxp_factura',
        entidad_id: facturaId,
        rol: 'xml_cfdi',
        nombre: files[0].name,
        url: path,
        tipo_mime: 'application/xml',
      });
      await admin.schema('erp').from('facturas').update({ xml_url: path }).eq('id', facturaId);
    }

    // Informativo (no bloqueante): el CFDI vino por menos que el neto = materiales
    // descontados al contratista.
    const esperado = Number(fac.total ?? 0);
    const deltaMateriales = esperado - cfdi.total;
    const warning =
      esperado > 0 && deltaMateriales > Math.max(1, esperado * 0.005)
        ? `Δ materiales $${deltaMateriales.toLocaleString('es-MX')} (neto del destajo $${esperado.toLocaleString('es-MX')}, facturado $${cfdi.total.toLocaleString('es-MX')}).`
        : null;

    await admin
      .schema('core')
      .from('audit_log')
      .insert({
        empresa_id: emp.id,
        usuario_id: user.id,
        accion: 'cxp_factura_recibir_cfdi_upload',
        tabla: 'erp.facturas',
        registro_id: facturaId,
        datos_nuevos: { uuid_sat: cfdi.uuid, total: cfdi.total, warning },
        user_agent: req.headers.get('user-agent'),
      });

    return NextResponse.json({ ok: true, facturaId, uuid: cfdi.uuid, warning }, { status: 200 });
  }

  // Facturas en espera (placeholders de destajo) para el auto-match (S4).
  const placeholders = await fetchDestajoPlaceholders(admin, emp.id);

  // ── Modo ANALYZE: por cada XML devuelve la sugerencia (destajo o normal),
  // sin escribir nada. El uploader lo llama antes del commit para el review.
  if (form.get('analyze') === '1') {
    const analisis: AnalisisArchivo[] = [];
    for (const file of files) {
      const a: AnalisisArchivo = {
        filename: file.name,
        ok: false,
        proveedorNombre: null,
        candidatos: [],
        sugerencia: 'normal',
      };
      try {
        const cfdi = parseCfdiXml(await file.text());
        a.emisorRfc = cfdi.emisorRfc;
        a.total = cfdi.total;
        a.uuid = cfdi.uuid;
        a.proveedorNombre = cfdi.emisorNombre;
        if (empresaRfc && cfdi.receptorRfc !== empresaRfc) {
          a.error = `El CFDI es para el RFC ${cfdi.receptorRfc}, no para ${empresaSlug}.`;
          analisis.push(a);
          continue;
        }
        if (cfdi.uuid) {
          const { data: dup } = await admin
            .schema('erp')
            .from('facturas')
            .select('id')
            .eq('uuid_sat', cfdi.uuid)
            .maybeSingle();
          if (dup) {
            a.yaCargada = true;
            a.error = `Ya cargada (folio ${cfdi.uuid.slice(0, 8)}…).`;
            analisis.push(a);
            continue;
          }
        }
        const { data: prov } = await admin
          .schema('erp')
          .from('personas')
          .select('id')
          .eq('rfc', cfdi.emisorRfc)
          .maybeSingle();
        a.proveedorId = prov?.id ?? null;
        a.candidatos = candidatosParaCfdi(placeholders, a.proveedorId, cfdi.total);
        a.sugerencia = sugerirAccion(a.candidatos, cfdi.total);
        a.ok = true;
      } catch (e) {
        a.error =
          e instanceof CfdiParseError ? e.message : `Error inesperado: ${(e as Error).message}`;
      }
      analisis.push(a);
    }
    return NextResponse.json({ ok: true, analisis }, { status: 200 });
  }

  // Decisiones del operador (commit del review): filename → destajo a asociar o 'normal'.
  // Sin decisiones → todo se crea como factura normal (compat con la carga directa).
  let decisiones: Record<string, string> = {};
  const decisionesRaw = form.get('decisiones');
  if (typeof decisionesRaw === 'string' && decisionesRaw) {
    try {
      decisiones = JSON.parse(decisionesRaw) as Record<string, string>;
    } catch {
      decisiones = {};
    }
  }

  const results: FacturaResult[] = [];

  // Rastro server-side de rechazos (se insertan en batch al final, junto con
  // la fila-resumen del lote).
  const userAgent = req.headers.get('user-agent');
  const auditRows: AuditLogInsert[] = [];
  const addRechazo = (args: {
    filename: string;
    motivo: string;
    uuidSat?: string | null;
    emisorRfc?: string | null;
    /** En duplicados, la factura ya existente — el link que faltaba al investigar. */
    facturaExistenteId?: string | null;
  }) => {
    auditRows.push({
      empresa_id: emp.id,
      usuario_id: user.id,
      accion: 'cxp_factura_rechazo',
      tabla: 'erp.facturas',
      registro_id: args.facturaExistenteId ?? null,
      datos_nuevos: {
        filename: args.filename,
        motivo: args.motivo,
        uuid_sat: args.uuidSat ?? null,
        emisor_rfc: args.emisorRfc ?? null,
      },
      user_agent: userAgent,
    });
  };

  for (const file of files) {
    const r: FacturaResult = { filename: file.name, ok: false };
    // Lo parseado hasta ahora, para que el rechazo del catch lleve uuid/RFC
    // aunque el error ocurra después del parse.
    let parsedForAudit: { uuid: string | null; emisorRfc: string } | null = null;
    try {
      const cfdi = parseCfdiXml(await file.text());
      parsedForAudit = { uuid: cfdi.uuid, emisorRfc: cfdi.emisorRfc };

      // El receptor del CFDI debe ser esta empresa.
      if (empresaRfc && cfdi.receptorRfc !== empresaRfc) {
        r.error = `El CFDI es para el RFC ${cfdi.receptorRfc}, no para ${empresaSlug} (${empresaRfc}).`;
        addRechazo({
          filename: file.name,
          motivo: r.error,
          uuidSat: cfdi.uuid,
          emisorRfc: cfdi.emisorRfc,
        });
        results.push(r);
        continue;
      }

      // Dedup por folio fiscal.
      if (cfdi.uuid) {
        const { data: dup } = await admin
          .schema('erp')
          .from('facturas')
          .select('id')
          .eq('uuid_sat', cfdi.uuid)
          .maybeSingle();
        if (dup) {
          r.uuid = cfdi.uuid;
          r.error = `Ya existe una factura con folio fiscal ${cfdi.uuid}.`;
          addRechazo({
            filename: file.name,
            motivo: r.error,
            uuidSat: cfdi.uuid,
            emisorRfc: cfdi.emisorRfc,
            facturaExistenteId: dup.id,
          });
          results.push(r);
          continue;
        }
      }

      // ── Decisión del operador: asociar este CFDI a un destajo en espera ──
      // (en vez de crear factura nueva → evita el duplicado del placeholder).
      const decision = decisiones[file.name];
      if (decision && decision !== 'normal') {
        const targetId = decision;
        const cand = placeholders.find((p) => p.facturaId === targetId);
        if (cand && cfdi.total > cand.neto * NETO_EPS) {
          r.error = `La factura ($${cfdi.total.toLocaleString('es-MX')}) excede el neto del destajo ($${cand.neto.toLocaleString('es-MX')}) — nunca debería ser mayor.`;
          addRechazo({
            filename: file.name,
            motivo: r.error,
            uuidSat: cfdi.uuid,
            emisorRfc: cfdi.emisorRfc,
          });
          results.push(r);
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: recErr } = await (admin.schema('erp') as any).rpc(
          'cxp_factura_recibir_cfdi',
          {
            p_factura_id: targetId,
            p_uuid_sat: cfdi.uuid ?? undefined,
            p_total: cfdi.total,
            p_subtotal: cfdi.subtotal,
            p_iva: cfdi.ivaTrasladado,
            p_fecha_emision: cfdi.fecha || undefined,
            p_emisor_rfc: cfdi.emisorRfc,
            p_emisor_nombre: cfdi.emisorNombre ?? undefined,
            p_receptor_rfc: cfdi.receptorRfc,
            p_forma_pago_sat: cfdi.formaPago ?? undefined,
            p_metodo_pago_sat:
              cfdi.metodoPago === 'PUE' || cfdi.metodoPago === 'PPD' ? cfdi.metodoPago : undefined,
            p_uso_cfdi: cfdi.usoCfdi ?? undefined,
            p_tasa_iva: cfdi.tasaIva ?? undefined,
            p_retencion_iva: cfdi.retencionIva,
            p_retencion_isr: cfdi.retencionIsr,
          }
        );
        if (recErr) {
          r.error = (recErr as { message: string }).message;
          addRechazo({
            filename: file.name,
            motivo: r.error,
            uuidSat: cfdi.uuid,
            emisorRfc: cfdi.emisorRfc,
          });
          results.push(r);
          continue;
        }
        const pathA = buildAdjuntoPath({
          empresa: empresaSlug as EmpresaSlug,
          entidad: 'facturas',
          entidadId: targetId,
          filename: file.name,
        });
        const bytesA = new Uint8Array(await file.arrayBuffer());
        const { error: upErrA } = await admin.storage
          .from('adjuntos')
          .upload(pathA, bytesA, { contentType: 'application/xml', upsert: false });
        if (!upErrA) {
          await admin.schema('erp').from('adjuntos').insert({
            empresa_id: emp.id,
            entidad_tipo: 'cxp_factura',
            entidad_id: targetId,
            rol: 'xml_cfdi',
            nombre: file.name,
            url: pathA,
            tipo_mime: 'application/xml',
          });
          await admin.schema('erp').from('facturas').update({ xml_url: pathA }).eq('id', targetId);
        }
        r.ok = true;
        r.facturaId = targetId;
        r.uuid = cfdi.uuid;
        results.push(r);
        continue;
      }

      // Emisor → proveedor (persona por RFC).
      const { data: prov } = await admin
        .schema('erp')
        .from('personas')
        .select('id')
        .eq('rfc', cfdi.emisorRfc)
        .maybeSingle();
      const proveedorId: string | null = prov?.id ?? null;

      // Alta de la factura (RPC SECURITY DEFINER).
      const rpcArgs: CxpFacturaAltaArgs = {
        // p_proveedor_id es posicionalmente requerido en el SQL pero la
        // columna acepta NULL: el cast permite pasar null cuando el emisor
        // no matchea un proveedor existente (carga inclusiva).
        p_empresa_id: emp.id,
        p_proveedor_id: proveedorId as string,
        p_total: cfdi.total,
        p_subtotal: cfdi.subtotal,
        p_iva: cfdi.ivaTrasladado,
        p_fecha_emision: cfdi.fecha || undefined,
        p_uuid_sat: cfdi.uuid ?? undefined,
        p_emisor_rfc: cfdi.emisorRfc,
        p_emisor_nombre: cfdi.emisorNombre ?? undefined,
        p_receptor_rfc: cfdi.receptorRfc,
        p_forma_pago_sat: cfdi.formaPago ?? undefined,
        p_metodo_pago_sat:
          cfdi.metodoPago === 'PUE' || cfdi.metodoPago === 'PPD' ? cfdi.metodoPago : undefined,
        p_uso_cfdi: cfdi.usoCfdi ?? undefined,
        p_tasa_iva: cfdi.tasaIva ?? undefined,
        p_retencion_iva: cfdi.retencionIva,
        p_retencion_isr: cfdi.retencionIsr,
        p_usuario_id: user.id,
      };
      const { data: facturaId, error: rpcErr } = await admin
        .schema('erp')
        .rpc('cxp_factura_alta', rpcArgs);
      if (rpcErr) {
        r.error = rpcErr.message;
        addRechazo({
          filename: file.name,
          motivo: r.error,
          uuidSat: cfdi.uuid,
          emisorRfc: cfdi.emisorRfc,
        });
        results.push(r);
        continue;
      }

      // Guardar el XML + registrar adjunto + xml_url (best-effort; la factura
      // ya quedó creada aunque el storage falle).
      const path = buildAdjuntoPath({
        empresa: empresaSlug as EmpresaSlug,
        entidad: 'facturas',
        entidadId: facturaId as string,
        filename: file.name,
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from('adjuntos')
        .upload(path, bytes, { contentType: 'application/xml', upsert: false });
      if (!upErr) {
        await admin.schema('erp').from('adjuntos').insert({
          empresa_id: emp.id,
          entidad_tipo: 'cxp_factura',
          entidad_id: facturaId,
          rol: 'xml_cfdi',
          nombre: file.name,
          url: path,
          tipo_mime: 'application/xml',
        });
        await admin.schema('erp').from('facturas').update({ xml_url: path }).eq('id', facturaId);
      }

      r.ok = true;
      r.facturaId = facturaId as string;
      r.uuid = cfdi.uuid;
      r.proveedorId = proveedorId;
      r.proveedorSugerido = proveedorId ? null : { rfc: cfdi.emisorRfc, nombre: cfdi.emisorNombre };
    } catch (e) {
      r.error =
        e instanceof CfdiParseError ? e.message : `Error inesperado: ${(e as Error).message}`;
      addRechazo({
        filename: file.name,
        motivo: r.error,
        uuidSat: parsedForAudit?.uuid,
        emisorRfc: parsedForAudit?.emisorRfc,
      });
    }
    results.push(r);
  }

  const exitosos = results.filter((x) => x.ok).length;

  // Fila-resumen del lote + rechazos acumulados, en un solo insert.
  // Best-effort: un fallo del audit no tumba la respuesta — las facturas
  // exitosas ya quedaron creadas.
  auditRows.push({
    empresa_id: emp.id,
    usuario_id: user.id,
    accion: 'cxp_facturas_upload_lote',
    tabla: 'erp.facturas',
    datos_nuevos: {
      total: results.length,
      exitosos,
      rechazados: results.length - exitosos,
    },
    user_agent: userAgent,
  });
  const { error: auditErr } = await admin.schema('core').from('audit_log').insert(auditRows);
  if (auditErr) {
    console.error('upload-xml: fallo al registrar audit_log:', auditErr.message);
  }

  const status = exitosos === results.length ? 200 : exitosos > 0 ? 207 : 422;
  return NextResponse.json(
    {
      ok: exitosos > 0,
      total: results.length,
      exitosos,
      results,
    },
    { status }
  );
}
