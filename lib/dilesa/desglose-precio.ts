import type { Json } from '@/types/supabase';

/**
 * Desglose del precio de venta DILESA — espejo de los campos que devuelve la
 * función `dilesa.fn_calcular_precio_venta`. Ver
 * `supabase/migrations/20260611023408_dilesa_unidades_problema_zcu.sql`.
 */
export type DesglosePrecio = {
  /** Valor base NETO (lista − descuento_valor_base). Base de las derivaciones. */
  valor_comercial: number;
  /** Valor base de lista del prototipo, ANTES del descuento autorizado. */
  valor_comercial_lista?: number;
  /**
   * Descuento al valor base autorizado por Dirección (0 si no hay). Pega antes
   * de las derivaciones — ver migración 20260701222450.
   */
  descuento_valor_base?: number;
  /**
   * Etiqueta del motivo del descuento (dilesa.descuento_motivos.nombre),
   * congelada app-side al asignar — NO viene de `fn_calcular_precio_venta`.
   * Es lo que se imprime en la solicitud junto al monto.
   */
  descuento_valor_base_motivo?: string;
  metros_excedentes: number;
  valor_excedente_terreno: number;
  valor_frente_verde: number;
  valor_esquina: number;
  pct_esquina_aplicado: number;
  valor_venta_futuro: number;
  costo_credito_adicional: number;
  zcu_exento?: boolean;
  productos_adicionales: number;
  sobreprecio_gastos_escrituracion: number;
  precio_venta_total: number;
  apoyo_infonavit: number;
  pago_directo: number;
  enganche_1pct: number;
  isai_2pct: number;
  gastos_notariales_6pct: number;
};

/**
 * Snapshot persistido en `dilesa.ventas.desglose_precio`. Congela el precio al
 * ASIGNAR la venta para que el detalle y el PDF de solicitud no se re-tarifen
 * en vivo cuando cambian reglas globales (exención ZCU, +6% del crédito).
 * Regla Beto 2026-06-15: las ventas/asignaciones anteriores NO se modifican;
 * las reglas nuevas solo aplican a las próximas asignaciones.
 *
 * - `componentes_detallados = true`: el desglose completo (ventas nuevas).
 * - `componentes_detallados = false`: solo el total de contrato, backfilleado
 *   de `precio_asignacion` (históricas sin desglose por componente capturado).
 */
export type DesglosePrecioSnapshot = Partial<DesglosePrecio> & {
  precio_venta_total: number;
  componentes_detallados: boolean;
  origen: 'asignacion' | 'backfill_contrato';
};

type CalculoEntrada =
  | (Partial<Omit<DesglosePrecio, 'precio_venta_total'>> & {
      precio_venta_total?: number | null;
      error?: string;
    })
  | null
  | undefined;

/**
 * Congela el desglose calculado al asignar una venta nueva. Devuelve el objeto
 * listo para persistir en `desglose_precio` (jsonb), o `null` si el cálculo no
 * es válido (sin precio o con error) — en ese caso la venta queda sin snapshot
 * y el detalle muestra los valores crudos sin recalcular.
 */
export function congelarDesglose(calculo: CalculoEntrada): Json | null {
  if (!calculo || calculo.error || calculo.precio_venta_total == null) return null;
  const campos: Record<string, unknown> = { ...calculo };
  delete campos.error;
  return { ...campos, origen: 'asignacion', componentes_detallados: true } as unknown as Json;
}

/**
 * Lee el snapshot persistido. Devuelve `null` cuando la venta no tiene desglose
 * congelado (histórica sin precio de asignación), para que el consumidor
 * muestre los snapshots crudos SIN recalcular en vivo.
 */
export function leerDesglose(json: unknown): DesglosePrecioSnapshot | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.precio_venta_total !== 'number') return null;
  const total = obj.precio_venta_total;
  const num = (k: string, factor: number): number =>
    typeof obj[k] === 'number' ? (obj[k] as number) : total * factor;
  return {
    ...obj,
    precio_venta_total: total,
    // Enganche 1% / ISAI 2% / gastos notariales 6% son % FIJOS del total
    // congelado — derivaciones puras, no dependen de reglas (ZCU/+6%). Se
    // computan del total cuando faltan para que las históricas (backfill sin
    // componentes) no muestren $0 en la solicitud/PDF. En ventas nuevas el
    // valor guardado ya es total×%, así que el resultado es idéntico.
    enganche_1pct: num('enganche_1pct', 0.01),
    isai_2pct: num('isai_2pct', 0.02),
    gastos_notariales_6pct: num('gastos_notariales_6pct', 0.06),
    componentes_detallados: obj.componentes_detallados === true,
    origen: obj.origen === 'asignacion' ? 'asignacion' : 'backfill_contrato',
  } as DesglosePrecioSnapshot;
}
