/**
 * Órdenes de cambio presupuestal (iniciativa `dilesa-presupuesto-baseline`).
 *
 * Types + helpers puros de presentación/agregación sobre
 * `erp.presupuesto_cambios` y `erp.presupuesto_baselines`. La lógica de
 * negocio dura (aplicar deltas, gates, audit) vive en las RPCs de DB
 * (`fn_presupuesto_baseline_autorizar` / `fn_presupuesto_cambio_resolver`);
 * aquí solo se derivan vistas para la UI del tab Gasto.
 */

export type OrdenCambioTipo = 'aditiva' | 'deductiva';
export type OrdenCambioEstado = 'solicitada' | 'autorizada' | 'rechazada' | 'cancelada';
export type OrdenCambioCategoria =
  | 'alcance'
  | 'precio_mercado'
  | 'error_estimacion'
  | 'adjudicacion'
  | 'reasignacion'
  | 'otro';

export type OrdenCambio = {
  id: string;
  proyectoId: string;
  partidaId: string;
  tipo: OrdenCambioTipo;
  /** Siempre > 0; el signo lo da `tipo`. */
  montoDelta: number;
  categoria: OrdenCambioCategoria;
  motivo: string;
  estado: OrdenCambioEstado;
  solicitadoPor: string | null;
  solicitadoAt: string;
  resueltoPor: string | null;
  resueltoAt: string | null;
  motivoRechazo: string | null;
  montoAntes: number | null;
  montoDespues: number | null;
};

export type BaselineInfo = {
  id: string;
  proyectoId: string;
  total: number;
  partidasCount: number;
  notas: string | null;
  autorizadoPor: string | null;
  autorizadoAt: string;
};

export const CATEGORIA_LABELS: Record<OrdenCambioCategoria, string> = {
  alcance: 'Cambio de alcance',
  precio_mercado: 'Precio de mercado',
  error_estimacion: 'Error de estimación',
  adjudicacion: 'Resultado de adjudicación',
  reasignacion: 'Reasignación entre partidas',
  otro: 'Otro',
};

export const CATEGORIAS: readonly OrdenCambioCategoria[] = [
  'alcance',
  'precio_mercado',
  'error_estimacion',
  'adjudicacion',
  'reasignacion',
  'otro',
];

export const ESTADO_LABELS: Record<OrdenCambioEstado, string> = {
  solicitada: 'Solicitada',
  autorizada: 'Autorizada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

/** Delta con signo: aditiva suma, deductiva resta. */
export function deltaFirmado(o: Pick<OrdenCambio, 'tipo' | 'montoDelta'>): number {
  return o.tipo === 'aditiva' ? o.montoDelta : -o.montoDelta;
}

/**
 * Σ deltas de las órdenes AUTORIZADAS por partida. Es la columna "Cambios"
 * del tab Gasto; por el invariante de DB, vigente = baseline + este neto.
 */
export function cambiosNetosPorPartida(ordenes: readonly OrdenCambio[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of ordenes) {
    if (o.estado !== 'autorizada') continue;
    out.set(o.partidaId, (out.get(o.partidaId) ?? 0) + deltaFirmado(o));
  }
  return out;
}

/** Órdenes en estado `solicitada` (pendientes de resolución de Dirección). */
export function ordenesPendientes(ordenes: readonly OrdenCambio[]): OrdenCambio[] {
  return ordenes.filter((o) => o.estado === 'solicitada');
}

/** Mapea una fila cruda de `erp.presupuesto_cambios` al type de la UI. */
export function mapOrdenCambio(r: {
  id: string;
  proyecto_id: string;
  partida_id: string;
  tipo: string;
  monto_delta: number | string | null;
  motivo_categoria: string;
  motivo: string;
  estado: string;
  solicitado_por: string | null;
  solicitado_at: string;
  resuelto_por: string | null;
  resuelto_at: string | null;
  motivo_rechazo: string | null;
  monto_aprobado_antes: number | string | null;
  monto_aprobado_despues: number | string | null;
}): OrdenCambio {
  return {
    id: r.id,
    proyectoId: r.proyecto_id,
    partidaId: r.partida_id,
    tipo: (r.tipo as OrdenCambioTipo) ?? 'aditiva',
    montoDelta: Number(r.monto_delta ?? 0),
    categoria: (r.motivo_categoria as OrdenCambioCategoria) ?? 'otro',
    motivo: r.motivo ?? '',
    estado: (r.estado as OrdenCambioEstado) ?? 'solicitada',
    solicitadoPor: r.solicitado_por ?? null,
    solicitadoAt: r.solicitado_at,
    resueltoPor: r.resuelto_por ?? null,
    resueltoAt: r.resuelto_at ?? null,
    motivoRechazo: r.motivo_rechazo ?? null,
    montoAntes: r.monto_aprobado_antes != null ? Number(r.monto_aprobado_antes) : null,
    montoDespues: r.monto_aprobado_despues != null ? Number(r.monto_aprobado_despues) : null,
  };
}
