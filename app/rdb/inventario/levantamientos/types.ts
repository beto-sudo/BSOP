export const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export type CrearLevantamientoInput = {
  almacen_id: string;
  fecha_programada: string; // YYYY-MM-DD
  notas?: string;
  tolerancia_pct_override?: number | null;
  tolerancia_monto_override?: number | null;
  /** 'fisico' (default) — el schema permite otros tipos a futuro. */
  tipo?: string;
};

export type FirmarPasoInput = {
  levantamiento_id: string;
  paso: number;
  rol: string;
  comentario?: string;
};

export type FirmarPasoData = {
  firmas_actuales: number;
  firmas_requeridas: number;
  aplicado: boolean;
  movimientos_generados: number;
};

export type LineaParaCapturar = {
  linea_id: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  unidad: string;
  categoria: string | null;
  /** NULL hasta que el contador la captura. Use `contado_at` como fuente de verdad de "ya contada". */
  cantidad_contada: number | null;
  contado_at: string | null;
  recontada: boolean;
};

export type LineaParaRevisar = {
  linea_id: string;
  producto_id: string;
  producto_codigo: string;
  producto_nombre: string;
  unidad: string;
  categoria: string | null;
  costo_unitario: number | null;
  stock_inicial: number;
  salidas_durante_captura: number;
  stock_efectivo: number;
  /** Puede ser NULL si la línea quedó sin contar al cerrar la captura. */
  cantidad_contada: number | null;
  diferencia: number | null;
  diferencia_valor: number | null;
  fuera_de_tolerancia: boolean;
  notas_diferencia: string | null;
  contado_at: string | null;
};
