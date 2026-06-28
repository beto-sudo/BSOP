/**
 * Helpers puros del módulo de Requisiciones de compra (DILESA, constructora-first).
 *
 * Iniciativa `dilesa-compras` · Sprint 2 Fase D. Espejo de `lib/compras/ordenes.ts`.
 *
 * Estado: NO hay catálogo de estados en `erp.requisiciones` — `estado_id` y
 * `prioridad_id` son `uuid` sueltos sin FK que nadie usa (0/241 filas vivas). El
 * ciclo se modela con `autorizada_at` + la existencia de una OC ligada (igual
 * que RDB):
 *   - pendiente  → autorizada_at null, sin OC viva  (editable, se autoriza/cancela)
 *   - autorizada → autorizada_at set, sin OC viva    (lista para comprar)
 *   - con_oc     → tiene OC ligada no cancelada       (ya convertida a orden)
 *
 * Cada línea se ancla a una partida (D12); `producto_id` queda null (D7). El
 * precio es `precio_estimado`: la requisición es una solicitud y **no** compromete
 * presupuesto — eso ocurre al emitir la OC (que sí mueve `comprometido`).
 */

/** Estado derivado de una requisición (no hay columna de estado en la tabla). */
export type ReqEstado = 'pendiente' | 'autorizada' | 'con_oc';

export const REQ_ESTADOS: readonly ReqEstado[] = ['pendiente', 'autorizada', 'con_oc'];

/** Línea de requisición anclada a partida (constructora). */
export type ReqLinea = {
  id: string;
  partidaId: string | null;
  /** Etiqueta de la partida/concepto (concepto_texto) para mostrar. */
  partidaLabel: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precioEstimado: number;
};

export type ReqRow = {
  id: string;
  codigo: string;
  proyectoId: string | null;
  proyectoNombre: string;
  solicitanteNombre: string;
  autorizadaAt: string | null;
  /** Folio de la OC ligada no-cancelada, si existe (→ estado con_oc). */
  ocCodigo: string | null;
  fecha: string | null;
  justificacion: string | null;
  /** La requisición es mano de obra / servicio contratado → la RFQ nace tipo=obra (adjudica a Contrato, no a OC). */
  esManoObra: boolean;
  /** Términos suaves que el solicitante propone (anticipo/plazo). Informativo; se formalizan al adjudicar. */
  terminosOfrecidos: string | null;
  lineas: ReqLinea[];
};

/** Total estimado de una línea: cantidad × precio_estimado. */
export function reqLineaTotal(l: Pick<ReqLinea, 'cantidad' | 'precioEstimado'>): number {
  return (l.cantidad ?? 0) * (l.precioEstimado ?? 0);
}

/** Total estimado de una requisición = Σ de sus líneas. */
export function reqTotal(r: Pick<ReqRow, 'lineas'>): number {
  return r.lineas.reduce((acc, l) => acc + reqLineaTotal(l), 0);
}

/** Estado derivado: la OC ligada gana; luego `autorizada_at`; si no, pendiente. */
export function deriveReqEstado(r: Pick<ReqRow, 'autorizadaAt' | 'ocCodigo'>): ReqEstado {
  if (r.ocCodigo) return 'con_oc';
  if (r.autorizadaAt) return 'autorizada';
  return 'pendiente';
}

/**
 * ¿Se puede generar OC? Si no hay OC viva ligada y hay al menos una línea con
 * cantidad > 0. La partida es **opcional**: una requisición de obra la lleva
 * (D12) pero una **requisición libre / gasto suelto** no — `partida_id` null →
 * la OC tampoco compromete presupuesto, que es justo lo que se busca.
 */
export function puedeGenerarOc(r: Pick<ReqRow, 'ocCodigo' | 'lineas'>): boolean {
  return !r.ocCodigo && r.lineas.some((l) => (l.cantidad ?? 0) > 0);
}

/**
 * KPIs reactivos a filtros (ADR-034) para el listado de requisiciones.
 * `estimado` suma el valor de lo **aún no convertido** a OC (pendiente +
 * autorizada) — es lo que falta por comprar.
 */
export function deriveReqKpis(rows: readonly ReqRow[]): {
  total: number;
  pendientes: number;
  autorizadas: number;
  conOc: number;
  estimado: number;
} {
  let pendientes = 0;
  let autorizadas = 0;
  let conOc = 0;
  let estimado = 0;
  for (const r of rows) {
    const e = deriveReqEstado(r);
    if (e === 'pendiente') pendientes += 1;
    else if (e === 'autorizada') autorizadas += 1;
    else conOc += 1;
    if (e !== 'con_oc') estimado += reqTotal(r);
  }
  return { total: rows.length, pendientes, autorizadas, conOc, estimado };
}
