import type { createSupabaseBrowserClient } from '@/lib/supabase-browser';

/**
 * Tipo de pago — buckets del filtro de /rdb/ventas.
 *
 * Espeja la clasificación que ya usa el módulo de Cortes en DB
 * (rdb.v_cortes_totales, migración 20260409220000): `cash` → efectivo,
 * `credit_card%` / `pos` → tarjeta, `stripe` → stripe, resto → otro.
 * Valores reales en prod (2026-07-02): cash, credit_card_visa, credit_card,
 * credit_card_master, POS, STRIPE, other.
 */
export type TipoPago = 'efectivo' | 'tarjeta' | 'stripe' | 'otro';

export const TIPOS_PAGO: TipoPago[] = ['efectivo', 'tarjeta', 'stripe', 'otro'];

export const TIPO_PAGO_LABELS: Record<TipoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  stripe: 'Stripe',
  otro: 'Otro',
};

export const TIPO_PAGO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos los pagos' },
  ...TIPOS_PAGO.map((t) => ({ value: t, label: TIPO_PAGO_LABELS[t] })),
];

export function clasificarMetodoPago(method: string | null | undefined): TipoPago {
  const m = (method ?? '').trim().toLowerCase();
  if (m === 'cash') return 'efectivo';
  if (m.startsWith('credit_card') || m === 'pos') return 'tarjeta';
  if (m === 'stripe') return 'stripe';
  return 'otro';
}

/**
 * Pagos de un pedido, agregados por tipo. `tipos` alimenta el filtro y la
 * columna de la tabla; `montoPorTipo` alimenta los KPI por método (los
 * montos vienen de `waitry_pagos.amount`, así un pago dividido reparte su
 * dinero al bucket correcto — mismo criterio que rdb.v_cortes_totales).
 */
export type PagosPedido = {
  tipos: Set<TipoPago>;
  montoPorTipo: Partial<Record<TipoPago, number>>;
};

/**
 * Pagos por pedido desde `rdb.waitry_pagos`.
 *
 * Un pedido con pago dividido (p.ej. efectivo + tarjeta) trae ambos tipos y
 * matchea el filtro por cualquiera de los dos — en el filtro se reporta
 * completo; en los montos por tipo, cada pago suma a su propio bucket.
 *
 * Chunked a 500 ids por el límite de longitud de URL de PostgREST (mismo
 * patrón que las líneas en los tabs Por producto / Por categoría).
 */
export async function fetchPagosPorPedido(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  orderIds: string[]
): Promise<Map<string, PagosPedido>> {
  const CHUNK = 500;
  const map = new Map<string, PagosPedido>();
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .schema('rdb')
      .from('waitry_pagos')
      .select('order_id, payment_method, amount')
      .in('order_id', chunk)
      .limit(10000);
    if (error) throw error;
    for (const pago of data ?? []) {
      if (!pago.order_id) continue;
      const tipo = clasificarMetodoPago(pago.payment_method);
      const entry = map.get(pago.order_id) ?? { tipos: new Set<TipoPago>(), montoPorTipo: {} };
      entry.tipos.add(tipo);
      entry.montoPorTipo[tipo] = (entry.montoPorTipo[tipo] ?? 0) + Number(pago.amount ?? 0);
      map.set(pago.order_id, entry);
    }
  }
  return map;
}

/**
 * Acumula los montos por tipo de un conjunto de pedidos (para los KPI del
 * summary). Los pedidos sin pagos registrados (undefined) no aportan.
 */
export function sumarMontosPorTipo(
  montos: Array<Partial<Record<TipoPago, number>> | undefined>
): Record<TipoPago, number> {
  const acc: Record<TipoPago, number> = { efectivo: 0, tarjeta: 0, stripe: 0, otro: 0 };
  for (const m of montos) {
    if (!m) continue;
    for (const t of TIPOS_PAGO) acc[t] += m[t] ?? 0;
  }
  return acc;
}

/**
 * ¿El pedido pasa el filtro de tipo de pago? Con filtro 'all' siempre.
 * Un pedido sin pagos registrados solo aparece bajo 'all'.
 */
export function matchTipoPago(tipos: Set<TipoPago> | undefined, pagoFilter: string): boolean {
  if (pagoFilter === 'all') return true;
  return tipos?.has(pagoFilter as TipoPago) ?? false;
}
