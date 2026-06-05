/**
 * Helpers puros del módulo de Órdenes de Compra (DILESA, constructora-first).
 *
 * Iniciativa `dilesa-compras` · Sprint 2 Fase B. Aislados aquí (sin React ni
 * Supabase) para test unitario y para que las fases C (recepción) y D
 * (requisiciones) reusen tipos/cálculos. Vive en `lib/compras/` (D4).
 *
 * Modelo: la línea se ancla a una partida de presupuesto (D12 "siempre hay
 * partida"); `producto_id` queda null (D7). Montos con IVA incluido (igual que
 * el costeo / traspaso ADR-038); el desglose subtotal/iva se difiere.
 */

/** Estados válidos de una OC (CHECK `oc_estado_valido` en `erp`). */
export type OcEstado = 'borrador' | 'enviada' | 'parcial' | 'cerrada' | 'cancelada';

export const OC_ESTADOS: readonly OcEstado[] = [
  'borrador',
  'enviada',
  'parcial',
  'cerrada',
  'cancelada',
];

/** Una OC en estado "vivo y comprometido" suma al presupuesto comprometido. */
export const OC_ESTADOS_COMPROMETEN: readonly OcEstado[] = ['enviada', 'parcial', 'cerrada'];

/** Línea de OC anclada a partida (constructora). */
export type OcLinea = {
  id: string;
  partidaId: string | null;
  /** Etiqueta de la partida/concepto (concepto_texto) para mostrar. */
  partidaLabel: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  cantidadRecibida: number;
  cantidadCancelada: number;
  /** precio_real ?? precio_unitario (el que usa el control de partida). */
  precioUnitario: number;
};

export type OcRow = {
  id: string;
  codigo: string;
  proyectoId: string | null;
  proyectoNombre: string;
  proveedorId: string | null;
  proveedorNombre: string;
  estado: OcEstado;
  fecha: string | null;
  lineas: OcLinea[];
};

/** Total de una línea: cantidad × precio (montos c/IVA). */
export function lineaTotal(linea: Pick<OcLinea, 'cantidad' | 'precioUnitario'>): number {
  return (linea.cantidad ?? 0) * (linea.precioUnitario ?? 0);
}

/** Total de una OC = Σ de sus líneas vivas (no canceladas en su totalidad). */
export function ocTotal(oc: Pick<OcRow, 'lineas'>): number {
  return oc.lineas.reduce((acc, l) => acc + lineaTotal(l), 0);
}

/** Cantidad aún por recibir de una línea: pedida − recibida − cancelada (≥ 0). */
export function lineaPendiente(
  l: Pick<OcLinea, 'cantidad' | 'cantidadRecibida' | 'cantidadCancelada'>
): number {
  return Math.max(0, (l.cantidad ?? 0) - (l.cantidadRecibida ?? 0) - (l.cantidadCancelada ?? 0));
}

/** ¿La OC tiene algo pendiente de recibir? (alguna línea con pendiente > 0). */
export function ocTienePendiente(oc: Pick<OcRow, 'lineas'>): boolean {
  return oc.lineas.some((l) => lineaPendiente(l) > 0);
}

/** ¿La OC compromete presupuesto? (estado enviada/parcial/cerrada). */
export function comprometeOc(estado: OcEstado): boolean {
  return OC_ESTADOS_COMPROMETEN.includes(estado);
}

/**
 * KPIs reactivos a filtros (ADR-034) para el listado de OCs.
 * `comprometido` = Σ total de las OCs que comprometen (espeja la semántica de
 * `erp.v_partida_control.comprometido`, que cuenta enviada/parcial/cerrada).
 */
export function deriveOcKpis(rows: readonly OcRow[]): {
  total: number;
  borrador: number;
  activas: number;
  cerradas: number;
  comprometido: number;
} {
  let borrador = 0;
  let activas = 0;
  let cerradas = 0;
  let comprometido = 0;
  for (const oc of rows) {
    if (oc.estado === 'borrador') borrador += 1;
    else if (oc.estado === 'enviada' || oc.estado === 'parcial') activas += 1;
    else if (oc.estado === 'cerrada') cerradas += 1;
    if (comprometeOc(oc.estado)) comprometido += ocTotal(oc);
  }
  return { total: rows.length, borrador, activas, cerradas, comprometido };
}
