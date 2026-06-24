/**
 * KPIs del cierre diario — correo al Consejo DILESA
 * (iniciativa dilesa-resumen-consejo-rediseno, Sprint 1).
 *
 * El cron del correo, al enviar (~20:00 Matamoros), calcula los KPIs del día y
 * los guarda en `dilesa.kpi_snapshot` (upsert por empresa+fecha). Eso habilita
 * los DELTAS ▲▼ del resumen ejecutivo (Sprint 3): el correo de hoy compara su
 * snapshot contra el más reciente previo.
 *
 * Diseño espejo de `resumen-consejo-email.ts`: la lógica de agregación vive en
 * funciones PURAS (`armarKpis`, `calcularDeltas`) testeables sin DB; las async
 * solo hacen fetch/upsert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Métricas de un día (lo que se persiste por fila de snapshot). */
export type KpisDelDia = {
  ventas_hoy_n: number;
  ventas_hoy_monto: number;
  escrituras_hoy_n: number;
  escrituras_hoy_monto: number;
  cobrado_hoy: number;
  liquidez_total: number;
  cxc_abierto: number;
  cxc_vencido: number;
  casas_en_obra: number;
};

/** Filas crudas que alimentan `armarKpis` (ya fetcheadas). */
export type KpisRaw = {
  fasesHoy: { venta_id: string; posicion: number | null }[];
  ventaMontos: {
    id: string;
    precio_asignacion: number | null;
    valor_escrituracion: number | null;
  }[];
  pagosHoy: { monto_total: number | null }[];
  cargosAbiertos: { saldo: number | null; fecha_vencimiento: string | null }[];
  saldos: { saldo: number | null }[];
  casasEnObra: number;
  /** Fecha local (YYYY-MM-DD) para decidir qué cargo CxC está vencido. */
  fechaLocal: string;
};

const KPI_CAMPOS: (keyof KpisDelDia)[] = [
  'ventas_hoy_n',
  'ventas_hoy_monto',
  'escrituras_hoy_n',
  'escrituras_hoy_monto',
  'cobrado_hoy',
  'liquidez_total',
  'cxc_abierto',
  'cxc_vencido',
  'casas_en_obra',
];

/**
 * Fecha LOCAL de Matamoros (YYYY-MM-DD) para un instante dado, con DST real.
 * El cron dispara en UTC ~01:00/02:00; a las 20:00 locales el día UTC ya rodó,
 * así que la fecha del snapshot debe calcularse en el TZ real, no en UTC (si no,
 * "hoy" se desfasa un día). `en-CA` formatea como YYYY-MM-DD.
 */
export function fechaLocalMatamoros(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Agrega las filas crudas en las métricas del día (pura). */
export function armarKpis(raw: KpisRaw): KpisDelDia {
  const montoPorVenta = new Map(raw.ventaMontos.map((v) => [v.id, v]));
  let ventas_hoy_n = 0;
  let ventas_hoy_monto = 0;
  let escrituras_hoy_n = 0;
  let escrituras_hoy_monto = 0;
  for (const f of raw.fasesHoy) {
    const v = montoPorVenta.get(f.venta_id);
    if (f.posicion === 2) {
      // Asignada (fase 2) = venta nueva del día.
      ventas_hoy_n += 1;
      ventas_hoy_monto += Number(v?.precio_asignacion ?? 0);
    } else if (f.posicion === 11) {
      // Escriturada (fase 11) = escritura del día.
      escrituras_hoy_n += 1;
      escrituras_hoy_monto += Number(v?.valor_escrituracion ?? 0);
    }
  }

  const cobrado_hoy = raw.pagosHoy.reduce((s, p) => s + Number(p.monto_total ?? 0), 0);
  const liquidez_total = raw.saldos.reduce((s, c) => s + Number(c.saldo ?? 0), 0);

  let cxc_abierto = 0;
  let cxc_vencido = 0;
  for (const c of raw.cargosAbiertos) {
    const saldo = Number(c.saldo ?? 0);
    cxc_abierto += saldo;
    // Comparación de strings YYYY-MM-DD = comparación cronológica.
    if (c.fecha_vencimiento && c.fecha_vencimiento < raw.fechaLocal) cxc_vencido += saldo;
  }

  return {
    ventas_hoy_n,
    ventas_hoy_monto,
    escrituras_hoy_n,
    escrituras_hoy_monto,
    cobrado_hoy,
    liquidez_total,
    cxc_abierto,
    cxc_vencido,
    casas_en_obra: raw.casasEnObra,
  };
}

/**
 * Delta de cada métrica vs el snapshot previo (pura). `null` cuando no hay
 * previo (primer día) — el render muestra el valor sin flecha en ese caso.
 */
export function calcularDeltas(
  hoy: KpisDelDia,
  previo: KpisDelDia | null
): Record<keyof KpisDelDia, number | null> {
  const out = {} as Record<keyof KpisDelDia, number | null>;
  for (const k of KPI_CAMPOS) {
    out[k] = previo ? Number(hoy[k]) - Number(previo[k]) : null;
  }
  return out;
}

/**
 * Calcula los KPIs del día contra las vistas/tablas DILESA+ERP. `fechaLocal` es
 * la fecha de Matamoros (de `fechaLocalMatamoros`). Lee con el cliente del cron
 * (service role).
 */
export async function computeKpisDelDia(
  supabase: SupabaseClient,
  empresaId: string,
  fechaLocal: string
): Promise<KpisDelDia> {
  const dilesa = supabase.schema('dilesa');
  const erp = supabase.schema('erp');

  const [fasesRes, pagosRes, cargosRes, saldosRes, obraRes] = await Promise.all([
    dilesa
      .from('venta_fases')
      .select('venta_id,posicion')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('fecha', fechaLocal)
      .in('posicion', [2, 11]),
    erp
      .from('cxc_pagos')
      .select('monto_total')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('fecha', fechaLocal),
    erp
      .from('cxc_cargos')
      .select('saldo,fecha_vencimiento')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .in('estado', ['pendiente', 'parcial']),
    erp.from('v_cuenta_saldo_actual').select('saldo').eq('empresa_id', empresaId),
    dilesa
      .from('construccion')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('estado', 'en_progreso'),
  ]);

  const fasesHoy = (fasesRes.data ?? []) as { venta_id: string; posicion: number | null }[];
  const ventaIds = [...new Set(fasesHoy.map((f) => f.venta_id))];
  const ventaMontos = ventaIds.length
    ? ((
        await dilesa
          .from('ventas')
          .select('id,precio_asignacion,valor_escrituracion')
          .in('id', ventaIds)
      ).data ?? [])
    : [];

  return armarKpis({
    fasesHoy,
    ventaMontos: ventaMontos as KpisRaw['ventaMontos'],
    pagosHoy: (pagosRes.data ?? []) as KpisRaw['pagosHoy'],
    cargosAbiertos: (cargosRes.data ?? []) as KpisRaw['cargosAbiertos'],
    saldos: (saldosRes.data ?? []) as KpisRaw['saldos'],
    casasEnObra: obraRes.count ?? 0,
    fechaLocal,
  });
}

/** Upsert idempotente del snapshot del día (por empresa+fecha). */
export async function upsertKpiSnapshot(
  supabase: SupabaseClient,
  empresaId: string,
  fecha: string,
  kpis: KpisDelDia
): Promise<{ ok: boolean; error?: unknown }> {
  const { error } = await supabase
    .schema('dilesa')
    .from('kpi_snapshot')
    .upsert(
      { empresa_id: empresaId, fecha, ...kpis, updated_at: new Date().toISOString() },
      { onConflict: 'empresa_id,fecha' }
    );
  return error ? { ok: false, error } : { ok: true };
}

/** Snapshot más reciente ANTERIOR a `fecha` (para los deltas). null si no hay. */
export async function fetchSnapshotPrevio(
  supabase: SupabaseClient,
  empresaId: string,
  fecha: string
): Promise<KpisDelDia | null> {
  const { data } = await supabase
    .schema('dilesa')
    .from('kpi_snapshot')
    .select('*')
    .eq('empresa_id', empresaId)
    .lt('fecha', fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const out = {} as KpisDelDia;
  for (const k of KPI_CAMPOS) out[k] = Number(row[k] ?? 0);
  return out;
}
