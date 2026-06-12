/**
 * Regla de "líder de la fila" para autorizar la asignación de una unidad
 * (captura Fase 2 — Asignada).
 *
 * La cola `dilesa.v_unidad_hold_queue` solo contiene solicitudes creadas en
 * BSOP (D4, migración 20260528191807): las ventas históricas importadas de
 * Coda (`coda_row_id IS NOT NULL`) NO participan en el sistema de holds.
 * Por eso la pertenencia a la cola no puede ser el único criterio — una
 * venta de Coda jamás aparece en la fila, aunque sea la única solicitud
 * activa de su unidad.
 */

export type ColaHoldRow = {
  venta_id: string;
  posicion: number;
};

/**
 * Decide si la venta puede autorizarse respecto a la fila de su unidad.
 *
 * - Si la fila tiene líder (posición 1), solo ese líder es autorizable.
 * - Si la fila está vacía, una venta histórica de Coda es autorizable
 *   (no participa en la cola por D4). Una venta BSOP fuera de su propia
 *   fila (borrada/expirada) no lo es.
 */
export function esLiderDeCola(cola: ColaHoldRow[], ventaId: string, esVentaCoda: boolean): boolean {
  const lider = cola.find((c) => c.posicion === 1);
  if (lider) return lider.venta_id === ventaId;
  return esVentaCoda;
}
