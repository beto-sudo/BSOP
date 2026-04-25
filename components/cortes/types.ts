import type { Denominacion } from '@/app/rdb/cortes/actions';

// Shared constants for the RDB cortes module.
export const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';
export const TZ = 'America/Matamoros';

// ─── Data shapes ──────────────────────────────────────────────────────────────

// Catálogo de bancos (seed en core.bancos). Cargado al montar el panel.
export type Banco = {
  id: string;
  codigo: string;        // 'BBVA', 'BANORTE', etc.
  nombre: string;        // 'BBVA México', 'Banorte', etc.
  patron_ocr: string | null;
  activo: boolean;
};

// Categoría de la foto subida.
// - voucher_tarjeta: cierre de lote de terminal bancaria
// - comprobante_movimiento: foto ligada a un movimiento_caja (ej. sobre de caja negra)
// - otro: sin clasificar
export type VoucherCategoria = 'voucher_tarjeta' | 'comprobante_movimiento' | 'otro';

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
  tipo_detalle: string | null;
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

// erp.cortes_vouchers row (signed_url resuelto en server action).
export type Voucher = {
  id: string;
  corte_id: string;
  storage_path: string;
  signed_url?: string | null;
  nombre_original: string | null;
  tamano_bytes: number | null;
  mime_type: string | null;
  afiliacion: string | null;
  monto_reportado: number | null;
  uploaded_by_nombre: string | null;
  uploaded_at: string | null;
  // Nuevos en migración 20260425153136. Opcionales en el tipo (no en DB) para
  // tolerar el mock optimista en voucher-uploader.tsx que se construye antes de
  // que se actualicen sus consumidores en fases siguientes. El SELECT del server
  // action sí los hidrata (la columna `categoria` es NOT NULL DEFAULT).
  categoria?: VoucherCategoria;
  banco_id?: string | null;
  banco_nombre?: string | null;       // resuelto via JOIN en server action; opcional para UI
  movimiento_caja_id?: string | null;
  ocr_texto_crudo?: string | null;
  ocr_monto_sugerido?: number | null;
  ocr_banco_sugerido_id?: string | null;
  ocr_confianza?: number | null;
};

// Validación client-side antes de llamar al server action.
// Espejo del CHECK del bucket (10 MB, mime types de imagen).
export const VOUCHER_MAX_BYTES = 10 * 1024 * 1024;
export const VOUCHER_ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

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

// ─── Catálogo de movimientos manuales de caja ─────────────────────────────────
// Hardcoded: 6 valores fijos que replican lo que RDB usaba en Coda antes de la
// migración (2026-04-23). Si el catálogo crece, mover a tabla seed en erp.

export type TipoMovimientoDireccion = 'entrada' | 'salida';

export type TipoMovimientoOption = {
  tipo_detalle: string;
  tipo: TipoMovimientoDireccion;
  label: string;
  descripcion: string;
  conceptoDefault?: string;
};

export const TIPO_MOVIMIENTO_OPTIONS: TipoMovimientoOption[] = [
  {
    tipo_detalle: 'caja_negra',
    tipo: 'salida',
    label: 'Caja negra',
    descripcion: 'Efectivo guardado al cierre (no es gasto).',
    conceptoDefault: 'Caja negra',
  },
  {
    tipo_detalle: 'retiro_efectivo',
    tipo: 'salida',
    label: 'Retiro de efectivo',
    descripcion: 'Gasto o compra pagada en efectivo desde la caja.',
  },
  {
    tipo_detalle: 'propina',
    tipo: 'salida',
    label: 'Propina a staff',
    descripcion: 'Pago de propinas al personal al cierre del turno.',
    conceptoDefault: 'Propinas staff',
  },
  {
    tipo_detalle: 'deposito_inicial',
    tipo: 'entrada',
    label: 'Depósito inicial',
    descripcion: 'Fondo extra que se agrega a la caja durante el turno (cambio).',
    conceptoDefault: 'Depósito para cambio',
  },
  {
    tipo_detalle: 'pago_proveedor',
    tipo: 'salida',
    label: 'Pago a proveedor',
    descripcion: 'Pago en efectivo a un proveedor.',
  },
  {
    tipo_detalle: 'gasto_operativo',
    tipo: 'salida',
    label: 'Gasto operativo',
    descripcion: 'Gasto general del negocio pagado de caja.',
  },
];
