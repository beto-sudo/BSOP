/* eslint-disable @typescript-eslint/no-explicit-any --
 * Los jsonb de `venta_fase_revisiones` (checks/extraccion) llevan shapes
 * con campos opcionales que el tipo `Json` generado no acepta; el cast es
 * deliberado (mismo patrón que otros endpoints erp/dilesa).
 */

/**
 * POST /api/dilesa/ventas/[ventaId]/cerrar-fase13 — cierre de la Fase 13
 * con gate de revisión (iniciativa `dilesa-ventas-captura-colaborativa`,
 * Sprint 3). El cierre dejó de ser client-side: el gate se valida AQUÍ.
 *
 * Reglas:
 *   - Fase 12 cerrada, Fase 13 sin cerrar.
 *   - Documentos requeridos vigentes en el expediente (factura_xml +
 *     aviso_pld + acuse_pld) y valor de escrituración capturado (F8).
 *   - Revisión PLD VIGENTE (sobre el informe Y el acuse actuales — ciclo
 *     completo, decisión Beto 2026-06-12) con veredicto `verde` → cierra
 *     directo.
 *   - Cualquier otro caso (sin revisión, stale, advertencias, rojo o
 *     error de IA) → requiere `override.motivo` y que el caller sea
 *     Dirección/admin (`checkDireccionEmpresa`); queda en `core.audit_log`
 *     (decisión Beto 2026-06-12: bloquear e informar que avanzar una
 *     operación que no cumple requiere autorización de Dirección).
 *
 * Body: { valorRealSnapshot?: number, override?: { motivo: string } }
 *   `valorRealSnapshot` = valor real venta DILESA calculado por el motor de
 *   cuadratura en el cliente (display-only para reportes; los montos de
 *   factura/NC se toman server-side del XML vigente, no del cliente).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { nombreFase } from '@/lib/dilesa/fases';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import { leerCfdiMetadata } from '@/lib/dilesa/captura/cfdi-validacion';
import { cargarCuadraturaVenta } from '@/lib/dilesa/cuadratura-server';
import { requiereNotaCredito } from '@/lib/dilesa/captura/pld-revision';

type Params = { params: Promise<{ ventaId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FASE = 13;

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

export async function POST(req: NextRequest, { params }: Params) {
  const { ventaId } = await params;
  if (!UUID_RE.test(ventaId)) {
    return NextResponse.json({ ok: false, error: 'Venta inválida.' }, { status: 400 });
  }

  let body: { valorRealSnapshot?: number | null; override?: { motivo?: string } };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

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

  // Miembro activo de DILESA o admin global.
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
    return NextResponse.json({ ok: false, error: 'Sin acceso a DILESA.' }, { status: 403 });
  }

  // ── Estado del pipeline ──────────────────────────────────────────
  const { data: ventaRow } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, valor_escrituracion, fase_posicion, saldo_residual_resolucion, saldo_residual_monto'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!ventaRow) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada.' }, { status: 404 });
  }
  const venta = ventaRow as {
    id: string;
    valor_escrituracion: number | null;
    fase_posicion: number | null;
    saldo_residual_resolucion: 'cobrar' | 'absorber' | null;
    saldo_residual_monto: number | null;
  };

  const { data: fasesRows } = await admin
    .schema('dilesa')
    .from('venta_fases')
    .select('posicion')
    .eq('venta_id', ventaId)
    .is('deleted_at', null);
  const posiciones = ((fasesRows ?? []) as { posicion: number }[]).map((f) => f.posicion);
  if (!posiciones.includes(12)) {
    return NextResponse.json(
      { ok: false, error: 'La Fase 12 (Detonar crédito) no está cerrada.' },
      { status: 409 }
    );
  }
  if (posiciones.includes(13)) {
    return NextResponse.json({ ok: false, error: 'La Fase 13 ya está cerrada.' }, { status: 409 });
  }

  const vEscr = Number(venta.valor_escrituracion ?? 0);
  if (!(vEscr > 0)) {
    return NextResponse.json(
      { ok: false, error: 'Falta el valor de escrituración (se captura en la Fase 8).' },
      { status: 409 }
    );
  }

  // ── Documentos requeridos vigentes ───────────────────────────────
  const { data: adjRows } = await admin
    .schema('erp')
    .from('adjuntos')
    .select('id, rol, metadata, created_at')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('entidad_tipo', 'venta')
    .eq('entidad_id', ventaId)
    .in('rol', ['factura_xml', 'nota_credito_xml', 'nota_credito', 'aviso_pld', 'acuse_pld'])
    .order('created_at', { ascending: false });
  const adjuntos = (adjRows ?? []) as {
    id: string;
    rol: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];
  const vigentePorRol = new Map<string, (typeof adjuntos)[number]>();
  for (const a of adjuntos) if (!vigentePorRol.has(a.rol)) vigentePorRol.set(a.rol, a);

  const facturaXml = vigentePorRol.get('factura_xml');
  const avisoPld = vigentePorRol.get('aviso_pld');
  const acusePld = vigentePorRol.get('acuse_pld');
  if (!facturaXml || !avisoPld || !acusePld) {
    const faltan = [
      !facturaXml && 'XML Factura (CFDI)',
      !avisoPld && 'PDF Aviso PLD',
      !acusePld && 'PDF Acuse de envío PLD',
    ]
      .filter(Boolean)
      .join(', ');
    return NextResponse.json(
      { ok: false, error: `Faltan documentos en el expediente: ${faltan}.` },
      { status: 409 }
    );
  }

  // ── Nota de crédito exigida por la cuadratura (control fiscal) ───
  // Si la operación factura más de lo que DILESA realmente recibe, debe
  // existir la NC (XML + PDF) antes de cerrar. Se recalcula server-side —
  // robusto aun si la revisión es vieja o nunca corrió. El override de
  // Dirección sigue disponible (decisión Beto 2026-06-13).
  const cuad = await cargarCuadraturaVenta(admin, ventaId);
  const montoNc = cuad?.montoNotaCredito ?? 0;
  const ncRequerida = requiereNotaCredito(montoNc);
  const ncXml = vigentePorRol.get('nota_credito_xml');
  const ncPdf = vigentePorRol.get('nota_credito');
  const ncFaltante = ncRequerida && (!ncXml || !ncPdf);
  // Total del CFDI de la NC (si existe), para reconciliar contra la cuadratura.
  const totalNc = leerCfdiMetadata(ncXml?.metadata)?.total ?? null;
  // Reconciliación de la absorción (iniciativa `dilesa-saldos-residuales` S2): si en
  // la dictaminación Dirección ABSORBIÓ un residual de precio con nota de crédito,
  // ese monto ya está en la NC derivada (`montoNc`). La NC emitida debe cubrirlo —
  // si el CFDI de NC queda por debajo de lo requerido, no cierra sin autorización de
  // Dirección. Acotado a las ventas con absorción (no cambia el flujo de las demás).
  const absorcion =
    venta.saldo_residual_resolucion === 'absorber' ? Number(venta.saldo_residual_monto ?? 0) : 0;
  const ncAbsorcionInsuficiente =
    absorcion > 0 && ncRequerida && !!ncXml && !!ncPdf && totalNc != null && totalNc < montoNc - 1;

  // ── Gate de revisión (ciclo completo: informe + acuse) ──────────
  const { data: revRow } = await (admin.schema('dilesa') as any)
    .from('venta_fase_revisiones')
    .select('id, adjunto_id, adjunto_acuse_id, estado, veredicto')
    .eq('venta_id', ventaId)
    .eq('fase', FASE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const revision = revRow as {
    id: string;
    adjunto_id: string | null;
    adjunto_acuse_id: string | null;
    estado: string;
    veredicto: string;
  } | null;

  const revisionStale =
    !!revision &&
    (revision.adjunto_id !== avisoPld.id || (revision.adjunto_acuse_id ?? null) !== acusePld.id);
  const revisionVigenteVerde =
    !!revision &&
    revision.estado === 'completada' &&
    revision.veredicto === 'verde' &&
    !revisionStale;

  const motivoOverride = body.override?.motivo?.trim() ?? '';
  let cierreConOverride = false;

  if (!revisionVigenteVerde || ncFaltante || ncAbsorcionInsuficiente) {
    const razon = ncFaltante
      ? `La cuadratura exige nota de crédito por ${money(montoNc)} y falta su ${!ncXml ? 'XML' : 'PDF'} en el expediente. Súbela y re-ejecuta la revisión.`
      : ncAbsorcionInsuficiente
        ? `La nota de crédito del CFDI (${money(totalNc ?? 0)}) no cubre la requerida por la cuadratura (${money(montoNc)}), que incluye ${money(absorcion)} absorbidos por Dirección en la dictaminación. Re-emítela por el total o autoriza el cierre con motivo.`
        : !revision
          ? 'La operación no tiene revisión PLD.'
          : revisionStale
            ? 'El Aviso PLD o su acuse cambiaron después de la última revisión.'
            : revision.estado !== 'completada'
              ? 'La última revisión no pudo completarse.'
              : `La revisión está en ${revision.veredicto}.`;

    if (!motivoOverride) {
      return NextResponse.json(
        {
          ok: false,
          requiereDireccion: true,
          error: `${razon} Para avanzar una operación que no cumple, debe autorizarla Dirección (con motivo).`,
        },
        { status: 403 }
      );
    }
    const gate = await checkDireccionEmpresa(userSupa, DILESA_EMPRESA_ID);
    if (!gate.ok || !gate.autorizado) {
      return NextResponse.json(
        {
          ok: false,
          requiereDireccion: true,
          error: `${razon} Solo Dirección puede autorizar el cierre de una operación que no cumple.`,
        },
        { status: 403 }
      );
    }
    cierreConOverride = true;
  }

  // ── Snapshot de montos + cierre ──────────────────────────────────
  // `totalNc` ya se leyó arriba (reconciliación de la absorción).
  const totalFactura = leerCfdiMetadata(facturaXml.metadata)?.total ?? null;

  const campos: {
    valor_facturado?: number;
    monto_nota_credito?: number;
    valor_real_venta_dilesa?: number;
    fase_actual?: string;
    fase_posicion?: number;
  } = {};
  if (totalFactura != null) campos.valor_facturado = totalFactura;
  if (totalNc != null) campos.monto_nota_credito = totalNc;
  if (typeof body.valorRealSnapshot === 'number' && Number.isFinite(body.valorRealSnapshot)) {
    campos.valor_real_venta_dilesa = body.valorRealSnapshot;
  }
  // Caché de posición: solo avanza, nunca retrocede (mismo criterio que
  // marcarFase).
  if (FASE > (venta.fase_posicion ?? 0)) {
    campos.fase_actual = nombreFase(FASE);
    campos.fase_posicion = FASE;
  }
  if (Object.keys(campos).length > 0) {
    const { error: updErr } = await admin
      .schema('dilesa')
      .from('ventas')
      .update(campos)
      .eq('id', ventaId);
    if (updErr) {
      return NextResponse.json(
        { ok: false, error: `No se pudieron guardar los montos: ${updErr.message}` },
        { status: 500 }
      );
    }
  }

  const { data: faseRow, error: faseErr } = await admin
    .schema('dilesa')
    .from('venta_fases')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      venta_id: ventaId,
      fase: nombreFase(FASE),
      posicion: FASE,
      fecha: new Date().toISOString().slice(0, 10),
      registrado_por: user.id,
      notas: cierreConOverride ? `Cierre autorizado por Dirección: ${motivoOverride}` : null,
    })
    .select('id')
    .single();
  if (faseErr) {
    return NextResponse.json(
      { ok: false, error: `No se cerró la fase: ${faseErr.message}` },
      { status: 500 }
    );
  }

  await admin
    .schema('core')
    .from('audit_log')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      usuario_id: user.id,
      accion: cierreConOverride ? 'fase13_cierre_override' : 'fase13_cerrada',
      tabla: 'dilesa.venta_fases',
      registro_id: faseRow.id as string,
      datos_nuevos: {
        venta_id: ventaId,
        veredicto: revision?.veredicto ?? null,
        revision_id: revision?.id ?? null,
        nc_requerida: ncRequerida,
        // Rastro de la resolución del saldo residual (S2): qué decidió Dirección y,
        // si absorbió, cuánto entró a la NC.
        saldo_residual_resolucion: venta.saldo_residual_resolucion,
        saldo_residual_absorbido: absorcion || null,
        ...(cierreConOverride
          ? {
              motivo: motivoOverride,
              nc_faltante: ncFaltante,
              nc_absorcion_insuficiente: ncAbsorcionInsuficiente,
            }
          : {}),
      },
    });

  return NextResponse.json({ ok: true, override: cierreConOverride });
}
