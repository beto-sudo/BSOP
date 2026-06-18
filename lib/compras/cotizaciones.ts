/**
 * Helpers puros del módulo de Cotizaciones / RFQ (DILESA, constructora-first).
 *
 * Iniciativa `dilesa-compras` · Sprint Cotizaciones (RFQ) · D2. Espejo de
 * `lib/compras/ordenes.ts` / `requisiciones.ts`: aislado aquí (sin React ni
 * Supabase) para test unitario y para que la UI de captura (Fase 2) y la de
 * comparativa + adjudicación (Fase 3) reusen tipos y cálculos.
 *
 * La RFQ es una **matriz**: N líneas (qué se pide, ancladas a partida, D12) × M
 * proveedores invitados, con un precio por celda (`cotizacion_proveedor_precios`).
 * Se compara lado a lado y se adjudica:
 *   - tipo 'compra' → genera una **OC** (materiales).
 *   - tipo 'obra'   → genera un **contrato de obra** (mano de obra; ADR-042).
 * Montos c/IVA (ADR-038), igual que el resto de compras.
 */

/** A qué se adjudica una RFQ según su tipo. */
export type CotizacionTipo = 'compra' | 'obra';

/** Estado de la RFQ (CHECK en `erp.cotizaciones`). */
export type CotizacionEstado = 'abierta' | 'comparada' | 'adjudicada' | 'cancelada';

/** Estado de un proveedor invitado (CHECK en `erp.cotizacion_proveedores`). */
export type CotProveedorEstado = 'invitado' | 'respondida' | 'elegida' | 'descartada';

export const COTIZACION_ESTADOS: readonly CotizacionEstado[] = [
  'abierta',
  'comparada',
  'adjudicada',
  'cancelada',
];

/** Línea de la RFQ: qué se pide, anclado a una partida (D12; null = gasto suelto). */
export type CotLinea = {
  id: string;
  partidaId: string | null;
  /** Etiqueta de la partida/concepto (concepto_texto) para mostrar. */
  partidaLabel: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  /**
   * Precio unitario estimado heredado de la requisición origen (0 = sin
   * estimado, p. ej. RFQ creada desde cero). Semilla editable de la matriz de
   * captura — el proveedor lo ajusta si difiere (ver `seedMatrizPrecios`).
   */
  precioEstimado: number;
};

/** Proveedor invitado a cotizar y su respuesta. */
export type CotProveedor = {
  /** id de `cotizacion_proveedores` (la fila de invitación, NO el proveedor base). */
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  estado: CotProveedorEstado;
  /** Total declarado por el proveedor (puede traer descuento global); null si no respondió. */
  montoTotal: number | null;
  tiempoEntrega: string | null;
  condiciones: string | null;
  notas: string | null;
};

/** Precio unitario de un proveedor para una línea — una celda de la matriz. */
export type CotPrecio = {
  /** id de `cotizacion_proveedores` (la columna de la matriz). */
  cotProveedorId: string;
  /** id de `cotizacion_lineas` (el renglón de la matriz). */
  lineaId: string;
  precioUnitario: number;
};

export type CotizacionRow = {
  id: string;
  codigo: string;
  tipo: CotizacionTipo;
  estado: CotizacionEstado;
  descripcion: string;
  fechaLimite: string | null;
  proyectoNombre: string;
  /** Proveedor base (erp.proveedores) adjudicado, si ya se adjudicó. */
  adjudicadoProveedorId: string | null;
  lineas: CotLinea[];
  proveedores: CotProveedor[];
  precios: CotPrecio[];
};

/** A qué documento adjudica esta RFQ según su tipo. */
export function adjudicaA(tipo: CotizacionTipo): 'oc' | 'contrato' {
  return tipo === 'obra' ? 'contrato' : 'oc';
}

/** Precio de un proveedor para una línea (0 si esa celda no se cotizó). */
export function precioCelda(
  precios: readonly CotPrecio[],
  cotProveedorId: string,
  lineaId: string
): number {
  const hit = precios.find((p) => p.cotProveedorId === cotProveedorId && p.lineaId === lineaId);
  return hit ? (hit.precioUnitario ?? 0) : 0;
}

/** Subtotal estimado de una línea (heredado de la requisición): cantidad × precio estimado. */
export function subtotalEstimadoLinea(l: Pick<CotLinea, 'cantidad' | 'precioEstimado'>): number {
  return (l.cantidad ?? 0) * (l.precioEstimado ?? 0);
}

/**
 * Total estimado de la RFQ = Σ (cantidad × precio estimado) de sus líneas. Es la
 * **referencia interna** heredada de la requisición, NO una oferta de proveedor:
 * se muestra a quien captura para comparar contra lo cotizado, y **nunca** se
 * envía en la Solicitud de Cotización — cada proveedor cotiza a ciegas para que
 * mande su mejor oferta sin anclarse al estimado.
 */
export function totalEstimado(
  lineas: readonly Pick<CotLinea, 'cantidad' | 'precioEstimado'>[]
): number {
  return lineas.reduce((acc, l) => acc + subtotalEstimadoLinea(l), 0);
}

/** ¿Alguna línea trae estimado heredado de la requisición? (gate de la columna ref.) */
export function tieneEstimado(lineas: readonly Pick<CotLinea, 'precioEstimado'>[]): boolean {
  return lineas.some((l) => (l.precioEstimado ?? 0) > 0);
}

/** Total de un proveedor desde la matriz: Σ (cantidad de la línea × precio de su celda). */
export function totalProveedorMatriz(
  lineas: readonly CotLinea[],
  precios: readonly CotPrecio[],
  cotProveedorId: string
): number {
  return lineas.reduce(
    (acc, l) => acc + (l.cantidad ?? 0) * precioCelda(precios, cotProveedorId, l.id),
    0
  );
}

/**
 * Total efectivo de un proveedor para comparar: usa el `montoTotal` declarado si
 * existe (puede incluir descuento global), de lo contrario lo deriva de la matriz.
 */
export function totalProveedor(c: CotizacionRow, cotProveedorId: string): number {
  const prov = c.proveedores.find((p) => p.id === cotProveedorId);
  if (prov && prov.montoTotal != null) return prov.montoTotal;
  return totalProveedorMatriz(c.lineas, c.precios, cotProveedorId);
}

/**
 * El proveedor (id de `cotizacion_proveedores`) con el menor precio para una
 * línea, ignorando celdas sin cotizar (precio 0). null si nadie la cotizó.
 * Útil para resaltar el mejor precio por renglón en la comparativa.
 */
export function mejorProveedorLinea(precios: readonly CotPrecio[], lineaId: string): string | null {
  let mejor: string | null = null;
  let min = Infinity;
  for (const p of precios) {
    if (p.lineaId !== lineaId) continue;
    const precio = p.precioUnitario ?? 0;
    if (precio > 0 && precio < min) {
      min = precio;
      mejor = p.cotProveedorId;
    }
  }
  return mejor;
}

/**
 * Proveedores que respondieron, ordenados por total efectivo ascendente — el
 * primero es el candidato más barato (sugerido para adjudicar). Empate: estable.
 */
export function rankingProveedores(c: CotizacionRow): Array<{
  cotProveedorId: string;
  proveedorId: string;
  proveedorNombre: string;
  total: number;
}> {
  return c.proveedores
    .filter((p) => p.estado === 'respondida' || p.estado === 'elegida')
    .map((p) => ({
      cotProveedorId: p.id,
      proveedorId: p.proveedorId,
      proveedorNombre: p.proveedorNombre,
      total: totalProveedor(c, p.id),
    }))
    .sort((a, b) => a.total - b.total);
}

/** ¿Hay al menos un proveedor con respuesta? (mínimo para comparar/adjudicar). */
export function tieneRespuestas(c: Pick<CotizacionRow, 'proveedores'>): boolean {
  return c.proveedores.some((p) => p.estado === 'respondida' || p.estado === 'elegida');
}

/**
 * ¿Se puede adjudicar? La RFQ está viva (abierta o comparada) y al menos un
 * proveedor respondió. La adjudicación (→ OC o contrato) la ejecuta la Fase 3.
 */
export function puedeAdjudicar(c: Pick<CotizacionRow, 'estado' | 'proveedores'>): boolean {
  return (c.estado === 'abierta' || c.estado === 'comparada') && tieneRespuestas(c);
}

/**
 * KPIs reactivos a filtros (ADR-034) para el listado de cotizaciones.
 * `montoAdjudicado` = Σ del total efectivo del proveedor elegido en las RFQ ya
 * adjudicadas (lo que se terminó comprometiendo vía la cotización).
 */
export function deriveCotizacionKpis(rows: readonly CotizacionRow[]): {
  total: number;
  abiertas: number;
  comparadas: number;
  adjudicadas: number;
  canceladas: number;
  montoAdjudicado: number;
} {
  let abiertas = 0;
  let comparadas = 0;
  let adjudicadas = 0;
  let canceladas = 0;
  let montoAdjudicado = 0;
  for (const c of rows) {
    if (c.estado === 'abierta') abiertas += 1;
    else if (c.estado === 'comparada') comparadas += 1;
    else if (c.estado === 'adjudicada') adjudicadas += 1;
    else if (c.estado === 'cancelada') canceladas += 1;
    if (c.estado === 'adjudicada') {
      const elegido = c.proveedores.find((p) => p.estado === 'elegida');
      if (elegido) montoAdjudicado += totalProveedor(c, elegido.id);
    }
  }
  return {
    total: rows.length,
    abiertas,
    comparadas,
    adjudicadas,
    canceladas,
    montoAdjudicado,
  };
}
