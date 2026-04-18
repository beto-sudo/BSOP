import type { Denominacion } from '@/app/rdb/cortes/actions';

// Shared constants for the RDB cortes module.
export const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
export const TZ = 'America/Matamoros';

// ─── Data shapes ──────────────────────────────────────────────────────────────

// rdb.cortes columns (plus v_cortes_totales columns via v_cortes_completo).
export type Corte = {
  id: string;
  corte_nombre: string | null;
  caja_nombre: string | null;
  caja_id: string | null;
  fecha_operativa: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: string | null;
  efectivo_inicial: number | null;
  efectivo_contado: number | null;
  responsable_apertura: string | null;
  responsable_cierre: string | null;
  turno: string | null;
  tipo: string | null;
  observaciones: string | null;
  // From v_cortes_totales via v_cortes_completo
  ingresos_efectivo?: number | null;
  ingresos_tarjeta?: number | null;
  ingresos_stripe?: number | null;
  ingresos_transferencias?: number | null;
  total_ingresos?: number | null;
  depositos?: number | null;
  retiros?: number | null;
  efectivo_esperado?: number | null;
  pedidos_count?: number | null;
};

// rdb.v_cortes_totales columns (lazy-loaded per corte).
export type CorteTotales = {
  corte_id: string;
  caja_id: string | null;
  caja_nombre: string | null;
  estado: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  efectivo_inicial: number | null;
  ingresos_efectivo: number | null;
  ingresos_tarjeta: number | null;
  ingresos_stripe: number | null;
  ingresos_transferencias: number | null;
  total_ingresos: number | null;
  depositos: number | null;
  retiros: number | null;
  efectivo_esperado: number | null;
};

// erp.movimientos_caja columns (filtered by empresa_id = RDB_EMPRESA_ID).
export type Movimiento = {
  id: string;
  corte_id: string;
  fecha_hora: string | null;
  tipo: string | null;
  monto: number | null;
  nota: string | null;
  registrado_por: string | null;
  c_corte_desc: string | null;
};

// rdb.v_cortes_productos row shape — per-product aggregates per corte.
export type CorteProducto = {
  corte_id: string | null;
  product_id: string | null;
  producto_nombre: string | null;
  cantidad_vendida: number | null;
  importe_total: number | null;
};

export type Caja = { id: string; nombre: string };

// ─── UI constants ─────────────────────────────────────────────────────────────

export const ESTADO_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'abierto', label: 'Abierto' },
  { value: 'cerrado', label: 'Cerrado' },
];

export const DENOMINACIONES_DEFAULT: Denominacion[] = [
  { denominacion: 1000, tipo: 'billete', cantidad: 0 },
  { denominacion: 500, tipo: 'billete', cantidad: 0 },
  { denominacion: 200, tipo: 'billete', cantidad: 0 },
  { denominacion: 100, tipo: 'billete', cantidad: 0 },
  { denominacion: 50, tipo: 'billete', cantidad: 0 },
  { denominacion: 20, tipo: 'billete', cantidad: 0 },
  { denominacion: 10, tipo: 'moneda', cantidad: 0 },
  { denominacion: 5, tipo: 'moneda', cantidad: 0 },
  { denominacion: 2, tipo: 'moneda', cantidad: 0 },
  { denominacion: 1, tipo: 'moneda', cantidad: 0 },
  { denominacion: 0.5, tipo: 'moneda', cantidad: 0 },
];
