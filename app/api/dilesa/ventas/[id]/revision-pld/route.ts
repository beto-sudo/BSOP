/* eslint-disable @typescript-eslint/no-explicit-any --
 * Los jsonb de `venta_fase_revisiones` (checks/extraccion) llevan shapes
 * con campos opcionales que el tipo `Json` generado no acepta; el cast es
 * deliberado (mismo patrón que otros endpoints erp/dilesa).
 */

/**
 * Revisión asistida del ciclo PLD de la Fase 13 (iniciativa
 * `dilesa-ventas-captura-colaborativa`, Sprints 3-4).
 *
 * POST — ejecuta la revisión sobre el ciclo PLD VIGENTE del expediente:
 *   1. Baja el INFORME de avisos (rol `aviso_pld`) y lo extrae con Claude
 *      (visión); cruza DETERMINISTA los 10 checks contra el expediente
 *      (venta, cliente, unidad, escritura F11, avalúo F5, depósitos CxC).
 *   2. Si hay ACUSE DE ENVÍO (rol `acuse_pld`), lo extrae y cruza contra el
 *      informe (RFC, referencia del aviso, plazo) — cierra el ciclo: el
 *      aviso no solo existe, SE PRESENTÓ. Flujo en dos pasos (decisión Beto
 *      2026-06-12): primero el informe se revisa y congela en verde, se
 *      presenta ante el SPPLD, y la corrida con acuse completa el ciclo.
 *      Una corrida sin acuse NO se penaliza (el gate de cierre exige el
 *      documento y la vigencia de ambos adjuntos por su cuenta).
 *      Optimización: si la revisión previa es del MISMO informe y trae su
 *      extracción, se reusa (no se re-paga la visión del PDF grande); el
 *      cruce determinista sí se recalcula con el expediente fresco.
 *   3. Persiste la corrida en `dilesa.venta_fase_revisiones` (append-only,
 *      ligada a la versión exacta de AMBOS adjuntos) + `core.audit_log`.
 *   Si la extracción IA falla, la corrida queda `estado='error'` — la
 *   operación no se atora: el cierre admite override de Dirección.
 *
 * GET — última revisión de la venta para la fase + si sigue vigente (los
 * adjuntos revisados son los vigentes del expediente).
 *
 * Auth: miembro activo de DILESA o admin global.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { resolveModel, runGenerateObject } from '@/lib/ai';
import { ensurePdfFitsForClaude } from '@/lib/documentos/extraction-core';
import { getNotaria } from '@/lib/dilesa/notarios';
import { getAdjuntoPath } from '@/lib/adjuntos';
import { cargarCuadraturaVenta } from '@/lib/dilesa/cuadratura-server';
import { leerCfdiMetadata } from '@/lib/dilesa/captura/cfdi-validacion';
import {
  checksFacturacion,
  cruzarAcuseConInforme,
  cruzarPldConExpediente,
  ExtraccionAcuseSchema,
  ExtraccionPldSchema,
  PROMPT_EXTRACCION_ACUSE,
  PROMPT_EXTRACCION_PLD,
  requiereNotaCredito,
  veredictoDe,
  type ExpedientePld,
  type RevisionCheck,
} from '@/lib/dilesa/captura/pld-revision';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FASE = 13;

type AuthResult =
  | { ok: true; userId: string; admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>> }
  | { ok: false; res: NextResponse };

async function autorizar(ventaId: string): Promise<AuthResult> {
  if (!UUID_RE.test(ventaId)) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'Venta inválida.' }, { status: 400 }),
    };
  }
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 }),
    };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'Configuración de servidor incompleta.' },
        { status: 500 }
      ),
    };
  }
  const [{ data: u }, { data: mem }] = await Promise.all([
    admin.schema('core').from('usuarios').select('rol').eq('id', user.id).maybeSingle(),
    admin
      .schema('core')
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', user.id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('activo', true)
      .maybeSingle(),
  ]);
  if (!mem && u?.rol !== 'admin') {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'Sin acceso a DILESA.' }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, admin };
}

/** Adjunto vigente (más reciente) de un rol en el expediente de la venta. */
async function adjuntoVigente(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ventaId: string,
  rol: string
): Promise<{ id: string; url: string; nombre: string } | null> {
  const { data } = await admin
    .schema('erp')
    .from('adjuntos')
    .select('id, url, nombre')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('entidad_tipo', 'venta')
    .eq('entidad_id', ventaId)
    .eq('rol', rol)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; url: string; nombre: string } | null) ?? null;
}

type RevisionRow = {
  id: string;
  adjunto_id: string | null;
  adjunto_acuse_id: string | null;
  estado: string;
  veredicto: string;
  checks: unknown;
  extraccion: unknown;
  error_detalle: string | null;
  ejecutado_por: string | null;
  created_at: string;
};

const REVISION_COLS =
  'id, adjunto_id, adjunto_acuse_id, estado, veredicto, checks, extraccion, error_detalle, ejecutado_por, created_at';

async function ultimaRevision(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ventaId: string
): Promise<RevisionRow | null> {
  const { data } = await (admin.schema('dilesa') as any)
    .from('venta_fase_revisiones')
    .select(REVISION_COLS)
    .eq('venta_id', ventaId)
    .eq('fase', FASE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RevisionRow | null) ?? null;
}

async function nombreUsuario(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin
    .schema('core')
    .from('usuarios')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  const completo = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return completo || data.email || null;
}

/**
 * La revisión es vigente si revisó exactamente los adjuntos vigentes del
 * expediente: el informe siempre; el acuse cuando exista (una revisión sin
 * acuse deja de ser vigente en cuanto alguien lo sube — debe re-correrse
 * para cubrir el ciclo completo).
 */
function esVigente(revision: RevisionRow, pldId: string | null, acuseId: string | null): boolean {
  return (
    !!pldId &&
    revision.adjunto_id === pldId &&
    (revision.adjunto_acuse_id ?? null) === (acuseId ?? null)
  );
}

/** Snapshot de facturación que la revisión guardó en `extraccion.facturacion`
 *  (los ids dejan al cliente detectar que la NC cambió tras la revisión). */
type FacturacionSnapshot = {
  requerida: boolean;
  montoEsperado: number;
  facturaXmlId: string | null;
  ncXmlId: string | null;
  ncPdfId: string | null;
};

function facturacionDe(extraccion: unknown): FacturacionSnapshot | null {
  const f = (extraccion as { facturacion?: Record<string, unknown> } | null)?.facturacion;
  if (!f || typeof f !== 'object') return null;
  return {
    requerida: f.requerida === true,
    montoEsperado: Number(f.montoEsperado ?? 0),
    facturaXmlId: (f.facturaXmlId as string | null) ?? null,
    ncXmlId: (f.ncXmlId as string | null) ?? null,
    ncPdfId: (f.ncPdfId as string | null) ?? null,
  };
}

function revisionDto(r: RevisionRow, ejecutadoPorNombre: string | null, vigente: boolean) {
  return {
    id: r.id,
    adjuntoId: r.adjunto_id,
    adjuntoAcuseId: r.adjunto_acuse_id,
    estado: r.estado,
    veredicto: r.veredicto,
    checks: r.checks,
    facturacion: facturacionDe(r.extraccion),
    errorDetalle: r.error_detalle,
    ejecutadoPorNombre,
    createdAt: r.created_at,
    vigente,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: ventaId } = await params;
  const auth = await autorizar(ventaId);
  if (!auth.ok) return auth.res;

  const [revision, pld, acuse] = await Promise.all([
    ultimaRevision(auth.admin, ventaId),
    adjuntoVigente(auth.admin, ventaId, 'aviso_pld'),
    adjuntoVigente(auth.admin, ventaId, 'acuse_pld'),
  ]);
  if (!revision) {
    return NextResponse.json({ ok: true, revision: null, tienePld: !!pld, tieneAcuse: !!acuse });
  }
  const nombre = await nombreUsuario(auth.admin, revision.ejecutado_por);
  const vigente = esVigente(revision, pld?.id ?? null, acuse?.id ?? null);
  return NextResponse.json({
    ok: true,
    revision: revisionDto(revision, nombre, vigente),
    tienePld: !!pld,
    tieneAcuse: !!acuse,
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: ventaId } = await params;
  const auth = await autorizar(ventaId);
  if (!auth.ok) return auth.res;
  const { admin, userId } = auth;

  // Documentos vigentes del ciclo (la revisión queda ligada a ESTAS versiones).
  const [pld, acuse] = await Promise.all([
    adjuntoVigente(admin, ventaId, 'aviso_pld'),
    adjuntoVigente(admin, ventaId, 'acuse_pld'),
  ]);
  if (!pld) {
    return NextResponse.json(
      { ok: false, error: 'El expediente no tiene Aviso PLD — súbelo primero.' },
      { status: 400 }
    );
  }

  // ── Expediente para el cruce ─────────────────────────────────────
  const { data: ventaRow } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, persona_id, unidad_id, notario_id, valor_escrituracion, monto_avaluo, numero_escritura, fecha_escritura'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!ventaRow) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada.' }, { status: 404 });
  }
  const venta = ventaRow as {
    id: string;
    empresa_id: string;
    persona_id: string;
    unidad_id: string | null;
    notario_id: string | null;
    valor_escrituracion: number | null;
    monto_avaluo: number | null;
    numero_escritura: string | null;
    fecha_escritura: string | null;
  };

  const [{ data: empresa }, { data: persona }, { data: unidad }, notaria, { data: abonos }, cuad] =
    await Promise.all([
      admin.schema('core').from('empresas').select('rfc').eq('id', DILESA_EMPRESA_ID).maybeSingle(),
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, rfc')
        .eq('id', venta.persona_id)
        .maybeSingle(),
      venta.unidad_id
        ? admin
            .schema('dilesa')
            .from('unidades')
            .select('calle, numero_oficial, area_m2, m2_construccion')
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      venta.notario_id ? getNotaria(admin, venta.notario_id) : Promise.resolve(null),
      admin
        .schema('erp')
        .from('cxc_pagos')
        .select('monto_total')
        .eq('origen_tipo', 'venta_dilesa')
        .eq('origen_id', ventaId)
        .is('deleted_at', null),
      // Cuadratura: alimenta el descuento perdonado del check liq_vs_pactado y
      // el monto de la NC de los checks de facturación (se reusa abajo).
      cargarCuadraturaVenta(admin, ventaId),
    ]);

  const empresaRfc = String((empresa as { rfc: string | null } | null)?.rfc ?? '');
  const expediente: ExpedientePld = {
    empresaRfc,
    clienteNombre: (persona as { nombre: string | null } | null)?.nombre ?? null,
    clienteApellidoPaterno:
      (persona as { apellido_paterno: string | null } | null)?.apellido_paterno ?? null,
    clienteApellidoMaterno:
      (persona as { apellido_materno: string | null } | null)?.apellido_materno ?? null,
    clienteRfc: (persona as { rfc: string | null } | null)?.rfc ?? null,
    valorEscrituracion: venta.valor_escrituracion,
    montoAvaluo: venta.monto_avaluo,
    numeroEscritura: venta.numero_escritura,
    fechaEscritura: venta.fecha_escritura,
    numeroNotaria: notaria?.numeroNotaria ?? null,
    unidadCalle: (unidad as { calle: string | null } | null)?.calle ?? null,
    unidadNumeroOficial:
      (unidad as { numero_oficial: string | null } | null)?.numero_oficial ?? null,
    unidadM2Terreno: (unidad as { area_m2: number | null } | null)?.area_m2 ?? null,
    unidadM2Construccion:
      (unidad as { m2_construccion: number | null } | null)?.m2_construccion ?? null,
    depositos: ((abonos ?? []) as { monto_total: number | null }[]).map((a) =>
      Number(a.monto_total ?? 0)
    ),
    // Descuento perdonado (no cobrado): el hueco legítimo entre liquidaciones y
    // valor pactado. El cheque a notaría girado NO perdona (entró y salió). Con el
    // desglose corregido (`dilesa-descuento-perdonado-motor`) `descuentoAplicado` ==
    // descuento real, así que el sobreprecio que NO perdona ya no infla este hueco.
    descuentoPerdonado: Math.max(0, (cuad?.descuentoAplicado ?? 0) - (cuad?.chequePagado ?? 0)),
    // Enganche del cliente que fondea gastos notariales (no el precio): se netea de
    // los depósitos registrados para comparar contra las liquidaciones del aviso
    // sobre la misma base (el dinero que liquidó el precio del inmueble).
    engancheAGastos: cuad?.coberturaGastos?.engancheCliente ?? 0,
  };

  // ── PDFs del ciclo ───────────────────────────────────────────────
  const descargarPdf = async (adj: { url: string; nombre: string }): Promise<Uint8Array> => {
    const path = getAdjuntoPath(adj.url);
    const { data: blob, error } = await admin.storage.from('adjuntos').download(path ?? '');
    if (error || !blob) {
      throw new Error(`No se pudo descargar "${adj.nombre}": ${error?.message ?? ''}`);
    }
    return ensurePdfFitsForClaude(new Uint8Array(await blob.arrayBuffer()));
  };

  const insertarRevision = async (fila: Record<string, unknown>) => {
    const { data, error } = await (admin.schema('dilesa') as any)
      .from('venta_fase_revisiones')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        venta_id: ventaId,
        fase: FASE,
        adjunto_id: pld.id,
        adjunto_acuse_id: acuse?.id ?? null,
        modelo: await resolveModel('dilesa-pld-informe'),
        ejecutado_por: userId,
        ...fila,
      })
      .select(REVISION_COLS)
      .single();
    if (error) throw new Error(error.message);
    return data as RevisionRow;
  };

  try {
    // 1) Informe de avisos → extracción + cruce contra el expediente.
    //    Si la última revisión completada es de ESTE mismo informe, su
    //    extracción se reusa (paso 2 del flujo: solo cambió el acuse).
    const previa = await ultimaRevision(admin, ventaId);
    const extraccionPrevia =
      previa &&
      previa.estado === 'completada' &&
      previa.adjunto_id === pld.id &&
      previa.extraccion &&
      typeof previa.extraccion === 'object' &&
      (previa.extraccion as { informe?: unknown }).informe
        ? ((previa.extraccion as { informe: unknown }).informe as Record<string, unknown>)
        : null;

    let informe;
    if (extraccionPrevia) {
      informe = ExtraccionPldSchema.parse(extraccionPrevia);
    } else {
      const pdfInforme = await descargarPdf(pld);
      informe = await runGenerateObject({
        usoId: 'dilesa-pld-informe',
        schema: ExtraccionPldSchema,
        maxRetries: 2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_EXTRACCION_PLD },
              { type: 'file', data: pdfInforme, mediaType: 'application/pdf' },
            ],
          },
        ],
      });
    }
    const checks: RevisionCheck[] = cruzarPldConExpediente(informe, expediente);

    // 2) Acuse de envío → cierra el ciclo (sin acuse, rojo explícito).
    let extraccionAcuse: unknown = null;
    if (acuse) {
      const pdfAcuse = await descargarPdf(acuse);
      const acuseExt = await runGenerateObject({
        usoId: 'dilesa-pld-acuse',
        schema: ExtraccionAcuseSchema,
        maxRetries: 2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_EXTRACCION_ACUSE },
              { type: 'file', data: pdfAcuse, mediaType: 'application/pdf' },
            ],
          },
        ],
      });
      extraccionAcuse = acuseExt;
      checks.push(...cruzarAcuseConInforme(acuseExt, informe, empresaRfc));
    }

    // 3) Facturación: la nota de crédito que exige la cuadratura (determinista,
    //    sin IA). El monto se calcula server-side (control fiscal — no se
    //    confía en un snapshot del cliente). Cuando la operación factura más
    //    de lo que DILESA realmente recibe, exige el XML y PDF de la NC.
    //    (`cuad` se cargó arriba, junto con el expediente.)
    const { data: factDocs } = await admin
      .schema('erp')
      .from('adjuntos')
      .select('id, rol, metadata')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('entidad_tipo', 'venta')
      .eq('entidad_id', ventaId)
      .in('rol', ['factura_xml', 'nota_credito_xml', 'nota_credito'])
      .order('created_at', { ascending: false });
    const factVigente = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
    for (const a of (factDocs ?? []) as {
      id: string;
      rol: string;
      metadata: Record<string, unknown> | null;
    }[]) {
      if (!factVigente.has(a.rol)) factVigente.set(a.rol, { id: a.id, metadata: a.metadata });
    }
    const facturaXml = factVigente.get('factura_xml') ?? null;
    const ncXml = factVigente.get('nota_credito_xml') ?? null;
    const ncPdf = factVigente.get('nota_credito') ?? null;
    const montoNotaCreditoEsperado = cuad?.montoNotaCredito ?? 0;
    checks.push(
      ...checksFacturacion({
        montoNotaCreditoEsperado,
        ncXmlTotal: leerCfdiMetadata(ncXml?.metadata)?.total ?? null,
        ncXmlPresente: !!ncXml,
        ncPdfPresente: !!ncPdf,
      })
    );
    const facturacionSnapshot = {
      requerida: requiereNotaCredito(montoNotaCreditoEsperado),
      montoEsperado: montoNotaCreditoEsperado,
      facturaXmlId: facturaXml?.id ?? null,
      ncXmlId: ncXml?.id ?? null,
      ncPdfId: ncPdf?.id ?? null,
    };

    const veredicto = veredictoDe(checks);
    const revision = await insertarRevision({
      estado: 'completada',
      veredicto,
      checks,
      extraccion: { informe, acuse: extraccionAcuse, facturacion: facturacionSnapshot },
    });

    await admin
      .schema('core')
      .from('audit_log')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        usuario_id: userId,
        accion: 'fase13_revision_pld',
        tabla: 'dilesa.venta_fase_revisiones',
        registro_id: revision.id,
        datos_nuevos: {
          venta_id: ventaId,
          veredicto,
          adjunto_id: pld.id,
          adjunto_acuse_id: acuse?.id ?? null,
        },
      });

    const nombre = await nombreUsuario(admin, userId);
    return NextResponse.json({ ok: true, revision: revisionDto(revision, nombre, true) });
  } catch (e) {
    // La IA falló (timeout, modelo, PDF ilegible): registrar la corrida en
    // error — el cierre sigue posible vía override de Dirección.
    const detalle = (e as Error).message;
    try {
      const revision = await insertarRevision({
        estado: 'error',
        veredicto: 'rojo',
        checks: [],
        error_detalle: detalle,
      });
      const nombre = await nombreUsuario(admin, userId);
      return NextResponse.json(
        {
          ok: false,
          error: `La revisión no pudo completarse: ${detalle}`,
          revision: revisionDto(revision, nombre, true),
        },
        { status: 502 }
      );
    } catch {
      return NextResponse.json(
        { ok: false, error: `La revisión no pudo completarse: ${detalle}` },
        { status: 502 }
      );
    }
  }
}
