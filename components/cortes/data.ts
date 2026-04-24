import { obtenerVouchersDelCorte } from '@/app/rdb/cortes/actions';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  RDB_EMPRESA_ID,
  type Caja,
  type Corte,
  type CorteProducto,
  type CorteTotales,
  type Movimiento,
  type Voucher,
} from './types';

/**
 * Data-fetch helpers for the cortes module. Kept separate from the orchestrator
 * to keep `cortes-view.tsx` focused on state wiring. No behavior change — just
 * extracted verbatim from the original single-file page.
 */

// List of cortes for the filter range (rdb.v_cortes_lista view).
export async function fetchCortesList({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}): Promise<Corte[]> {
  const supabase = createSupabaseBrowserClient();

  let query = supabase
    .schema('rdb')
    .from('v_cortes_lista')
    .select('*')
    .order('fecha_operativa', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .limit(300);

  if (dateFrom) query = query.gte('fecha_operativa', dateFrom);
  if (dateTo) query = query.lte('fecha_operativa', dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Corte[];
}

// Per-corte detail: totales, movimientos, productos, vouchers — loaded in parallel.
// Vouchers pasan por el server action porque resuelven signed URLs y aplican
// la policy RLS autenticada (el browser client del detail drawer también
// funcionaría, pero el server action ya centraliza la lógica de firmado).
export async function fetchCorteDetail(corteId: string): Promise<{
  totales: CorteTotales | null;
  movimientos: Movimiento[];
  productos: CorteProducto[];
  vouchers: Voucher[];
}> {
  const supabase = createSupabaseBrowserClient();
  const [totalesRes, movimientosRes, productosRes, vouchers] = await Promise.all([
    supabase
      .schema('rdb')
      .from('v_cortes_totales')
      .select('*')
      .eq('corte_id', corteId)
      .maybeSingle(),
    supabase
      .schema('erp')
      .from('movimientos_caja')
      .select(
        'id,corte_id,fecha_hora:created_at,tipo,tipo_detalle,monto,nota:concepto,registrado_por:realizado_por_nombre'
      )
      .eq('empresa_id', RDB_EMPRESA_ID)
      .eq('corte_id', corteId)
      .order('created_at', { ascending: true })
      .limit(100),
    // B.1.extra.b: `rdb.v_cortes_productos` — per-product aggregates per corte
    // (RDB / Waitry POS). Joins rdb.waitry_productos ↔ rdb.waitry_pedidos via
    // the corte_id FK (partial index `rdb_waitry_pedidos_corte_id_idx`).
    // Created 2026-04-17, security_invoker = true.
    supabase
      .schema('rdb')
      .from('v_cortes_productos')
      .select('*')
      .eq('corte_id', corteId)
      .order('importe_total', { ascending: false })
      .limit(100),
    obtenerVouchersDelCorte(corteId).catch(() => [] as Voucher[]),
  ]);

  return {
    totales: (totalesRes.data as CorteTotales | null) ?? null,
    movimientos: (movimientosRes.data ?? []) as Movimiento[],
    productos: (productosRes?.data ?? []) as CorteProducto[],
    vouchers,
  };
}

// Load the list of cajas for the empresa and resolve the logged-in user's name.
export async function fetchAbrirCajaContext(): Promise<{
  cajas: Caja[];
  userName: string;
  firstName: string;
}> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userName = user?.user_metadata?.full_name || user?.email || '';
  const firstName = userName.split(' ')[0] || '';

  const { data, error } = await supabase
    .schema('erp')
    .from('cajas')
    .select('id, nombre')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .order('nombre');
  if (error) throw error;

  return { cajas: (data ?? []) as Caja[], userName, firstName };
}
