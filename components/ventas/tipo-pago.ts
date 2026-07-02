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

export const TIPO_PAGO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Todos los pagos' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'otro', label: 'Otro' },
];

export function clasificarMetodoPago(method: string | null | undefined): TipoPago {
  const m = (method ?? '').trim().toLowerCase();
  if (m === 'cash') return 'efectivo';
  if (m.startsWith('credit_card') || m === 'pos') return 'tarjeta';
  if (m === 'stripe') return 'stripe';
  return 'otro';
}

/**
 * Tipos de pago usados por cada pedido, desde `rdb.waitry_pagos`.
 *
 * Un pedido con pago dividido (p.ej. efectivo + tarjeta) trae ambos tipos y
 * matchea el filtro por cualquiera de los dos — se reporta completo, no se
 * parte el monto por método.
 *
 * Chunked a 500 ids por el límite de longitud de URL de PostgREST (mismo
 * patrón que las líneas en los tabs Por producto / Por categoría).
 */
export async function fetchTiposPagoPorPedido(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  orderIds: string[]
): Promise<Map<string, Set<TipoPago>>> {
  const CHUNK = 500;
  const map = new Map<string, Set<TipoPago>>();
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const chunk = orderIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .schema('rdb')
      .from('waitry_pagos')
      .select('order_id, payment_method')
      .in('order_id', chunk)
      .limit(10000);
    if (error) throw error;
    for (const pago of data ?? []) {
      if (!pago.order_id) continue;
      const tipos = map.get(pago.order_id) ?? new Set<TipoPago>();
      tipos.add(clasificarMetodoPago(pago.payment_method));
      map.set(pago.order_id, tipos);
    }
  }
  return map;
}

/**
 * ¿El pedido pasa el filtro de tipo de pago? Con filtro 'all' siempre.
 * Un pedido sin pagos registrados solo aparece bajo 'all'.
 */
export function matchTipoPago(tipos: Set<TipoPago> | undefined, pagoFilter: string): boolean {
  if (pagoFilter === 'all') return true;
  return tipos?.has(pagoFilter as TipoPago) ?? false;
}
