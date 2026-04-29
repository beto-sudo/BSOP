import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type ProductoInfo = {
  id: string;
  nombre: string;
  unidad: string | null;
  categoria_nombre: string | null;
  inventariable: boolean;
  ultimo_costo: number | null;
  ultimo_precio_venta: number | null;
};

export type InsumoReceta = {
  insumo_id: string;
  insumo_nombre: string;
  insumo_unidad: string | null;
  insumo_inventariable: boolean;
  insumo_orfano: boolean;
  cantidad: number;
  unidad: string;
  costo_insumo: number | null;
  costo_subtotal: number | null;
};

export type Receta = {
  producto_venta_id: string;
  producto_venta_nombre: string;
  categoria_nombre: string | null;
  precio_venta: number | null;
  insumos: InsumoReceta[];
  insumos_count: number;
  costo_total: number | null;
  margen_pct: number | null;
};

type RawInsumo = { insumo_id: string; cantidad: number; unidad: string };

function computeReceta(
  producto: ProductoInfo,
  rawInsumos: RawInsumo[],
  productoLookup: Map<string, ProductoInfo>
): Receta {
  let costoTotal: number | null = 0;
  let allCostsKnown = rawInsumos.length > 0;

  const insumos: InsumoReceta[] = rawInsumos.map((row) => {
    const insumo = productoLookup.get(row.insumo_id);
    const costoUnit = insumo?.ultimo_costo ?? null;
    const subtotal = costoUnit == null ? null : costoUnit * row.cantidad;
    if (subtotal == null) {
      allCostsKnown = false;
    } else if (costoTotal != null) {
      costoTotal += subtotal;
    }
    return {
      insumo_id: row.insumo_id,
      insumo_nombre: insumo?.nombre ?? 'Insumo eliminado',
      insumo_unidad: insumo?.unidad ?? null,
      insumo_inventariable: insumo?.inventariable ?? false,
      insumo_orfano: !insumo,
      cantidad: row.cantidad,
      unidad: row.unidad,
      costo_insumo: costoUnit,
      costo_subtotal: subtotal,
    };
  });

  const finalCosto = allCostsKnown ? costoTotal : null;
  const precio = producto.ultimo_precio_venta;
  const margen =
    finalCosto != null && precio != null && precio > 0
      ? ((precio - finalCosto) / precio) * 100
      : null;

  return {
    producto_venta_id: producto.id,
    producto_venta_nombre: producto.nombre,
    categoria_nombre: producto.categoria_nombre,
    precio_venta: precio,
    insumos,
    insumos_count: insumos.length,
    costo_total: finalCosto,
    margen_pct: margen,
  };
}

/**
 * Fetch + ensambla todas las recetas de RDB en una sola operación. Las
 * recetas huérfanas (producto vendible eliminado) se descartan
 * silenciosamente; los insumos huérfanos se preservan para que el
 * reporte de auditoría los pueda mostrar.
 */
export async function fetchRecetas(
  supabase: SupabaseClient<Database>,
  empresaId: string
): Promise<Receta[]> {
  const [recetaRes, productoRes] = await Promise.all([
    supabase
      .schema('erp')
      .from('producto_receta')
      .select('producto_venta_id, insumo_id, cantidad, unidad')
      .eq('empresa_id', empresaId),
    supabase.schema('rdb').from('v_productos_tabla').select('*'),
  ]);
  if (recetaRes.error) throw recetaRes.error;
  if (productoRes.error) throw productoRes.error;

  const productoLookup = new Map<string, ProductoInfo>();
  for (const p of productoRes.data ?? []) {
    if (!p.id) continue;
    productoLookup.set(p.id, {
      id: p.id,
      nombre: p.nombre ?? 'Sin nombre',
      unidad: p.unidad ?? null,
      categoria_nombre: p.categoria_nombre ?? null,
      inventariable: p.inventariable ?? false,
      ultimo_costo: p.ultimo_costo == null ? null : Number(p.ultimo_costo),
      ultimo_precio_venta: p.ultimo_precio_venta == null ? null : Number(p.ultimo_precio_venta),
    });
  }

  const grouped = new Map<string, RawInsumo[]>();
  for (const row of recetaRes.data ?? []) {
    if (!row.producto_venta_id) continue;
    const list = grouped.get(row.producto_venta_id) ?? [];
    list.push({
      insumo_id: row.insumo_id ?? '',
      cantidad: Number(row.cantidad ?? 0),
      unidad: row.unidad ?? '',
    });
    grouped.set(row.producto_venta_id, list);
  }

  const out: Receta[] = [];
  for (const [productoVentaId, rows] of grouped) {
    const producto = productoLookup.get(productoVentaId);
    if (!producto) continue;
    out.push(computeReceta(producto, rows, productoLookup));
  }
  out.sort((a, b) => a.producto_venta_nombre.localeCompare(b.producto_venta_nombre));
  return out;
}

// ── Insumos disponibles (para editor) ────────────────────────────────────────

export type InsumoDisponible = {
  id: string;
  nombre: string;
  unidad: string | null;
};

/**
 * Lista de productos inventariables activos de la empresa, candidatos a ser
 * insumos en una receta. Consumido por el editor de receta para poblar el
 * combobox "Agregar insumo".
 */
export async function fetchInsumosDisponibles(
  supabase: SupabaseClient<Database>,
  empresaId: string
): Promise<InsumoDisponible[]> {
  const { data, error } = await supabase
    .schema('erp')
    .from('productos')
    .select('id, nombre, unidad')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .eq('inventariable', true)
    .order('nombre');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre ?? 'Sin nombre',
    unidad: p.unidad ?? null,
  }));
}

// ── Auditoría ────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning';

export type AlertType =
  | 'margen_negativo'
  | 'insumo_sin_costo'
  | 'insumo_huerfano'
  | 'insumo_no_inventariable';

export type RecetaAlert = {
  type: AlertType;
  severity: AlertSeverity;
  receta: Receta;
  /** Detalle textual: nombres de insumos involucrados, valores numéricos, etc. */
  detalle: string;
};

const ALERT_LABELS: Record<AlertType, string> = {
  margen_negativo: 'Margen negativo',
  insumo_sin_costo: 'Insumo sin costo',
  insumo_huerfano: 'Insumo huérfano',
  insumo_no_inventariable: 'Insumo no inventariable',
};

export function alertLabel(type: AlertType): string {
  return ALERT_LABELS[type];
}

/**
 * Audita una receta y devuelve las alertas que aplican. Sin heurísticas
 * dependientes de configuración manual — solo señales 100% derivables
 * del estado actual de la receta y sus insumos.
 *
 * No incluye "producto vendible sin receta esperada" (requiere
 * decisión sobre qué señal usar — categoría, flag, regla derivada — y
 * datos operativos para calibrar). Ese check entra en sprint
 * posterior si surge la necesidad.
 */
export function auditarReceta(receta: Receta): RecetaAlert[] {
  const alerts: RecetaAlert[] = [];

  if (
    receta.costo_total != null &&
    receta.precio_venta != null &&
    receta.costo_total > receta.precio_venta
  ) {
    alerts.push({
      type: 'margen_negativo',
      severity: 'critical',
      receta,
      detalle: `Costo ${receta.costo_total.toFixed(2)} > precio ${receta.precio_venta.toFixed(2)}`,
    });
  }

  const huerfanos = receta.insumos.filter((i) => i.insumo_orfano);
  if (huerfanos.length > 0) {
    alerts.push({
      type: 'insumo_huerfano',
      severity: 'warning',
      receta,
      detalle: `${huerfanos.length} insumo(s) eliminado(s) en el catálogo`,
    });
  }

  const sinCosto = receta.insumos.filter((i) => !i.insumo_orfano && i.costo_insumo == null);
  if (sinCosto.length > 0) {
    const nombres = sinCosto.slice(0, 3).map((i) => i.insumo_nombre);
    const extra = sinCosto.length > 3 ? ` y ${sinCosto.length - 3} más` : '';
    alerts.push({
      type: 'insumo_sin_costo',
      severity: 'warning',
      receta,
      detalle: `Sin último costo: ${nombres.join(', ')}${extra}`,
    });
  }

  const noInv = receta.insumos.filter((i) => !i.insumo_orfano && !i.insumo_inventariable);
  if (noInv.length > 0) {
    const nombres = noInv.slice(0, 3).map((i) => i.insumo_nombre);
    const extra = noInv.length > 3 ? ` y ${noInv.length - 3} más` : '';
    alerts.push({
      type: 'insumo_no_inventariable',
      severity: 'warning',
      receta,
      detalle: `Insumos no inventariables: ${nombres.join(', ')}${extra}`,
    });
  }

  return alerts;
}

export function auditarRecetas(recetas: Receta[]): RecetaAlert[] {
  const out: RecetaAlert[] = [];
  for (const r of recetas) out.push(...auditarReceta(r));
  return out;
}
