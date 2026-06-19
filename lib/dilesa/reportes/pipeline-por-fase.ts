/**
 * Motor del reporte «Pipeline por fase» (DILESA · Ventas).
 *
 * Lógica pura y testeable: agrupa las ventas activas por fase del catálogo
 * y produce conteo + monto + share por fase. Una sola fuente de verdad que
 * consumen TANTO la vista en pantalla como el PDF — el principio del patrón
 * (ADR-047): el motor deriva, la vista y el PDF solo presentan.
 *
 * Decisión de negocio (espejo del tab Fases existente): el pipeline cuenta
 * solo las ventas en estado 'activa' — las desasignadas y las terminadas no
 * son tubería viva. El precio efectivo es `valor_escrituracion ?? valor_comercial`
 * (criterio de Beto, ya usado en `components/dilesa/ventas-module.tsx`).
 */

/** Una fila del catálogo de fases (las 17 fases del proceso). */
export type FaseCatalogo = {
  posicion: number;
  nombre: string;
  rol: string | null;
};

/** Venta ya normalizada para el pipeline (estado + fase + precio resuelto). */
export type VentaPipeline = {
  estado: string;
  fase_actual: string | null;
  /** Precio efectivo: `valor_escrituracion ?? valor_comercial`. */
  precio: number | null;
};

/**
 * Venta con los campos necesarios para filtrar el reporte. Extiende
 * `VentaPipeline` para que pueda pasarse directo al motor tras filtrar.
 */
export type VentaReporte = VentaPipeline & {
  /** Proyecto resuelto vía `unidad → proyecto_id`. */
  proyectoId: string | null;
  /** Vendedor resuelto (FK a core.usuarios, fallback al texto legacy). */
  vendedor: string | null;
  /** Mes de creación en formato `YYYY-MM`. */
  mes: string;
};

/** Filtros del reporte (cadena vacía = sin filtro). Espejados en UI y PDF. */
export type FiltrosPipeline = {
  proyecto: string;
  vendedor: string;
  mes: string;
};

export const FILTROS_PIPELINE_VACIOS: FiltrosPipeline = { proyecto: '', vendedor: '', mes: '' };

/**
 * Aplica los filtros del reporte. Función pura compartida por la vista en
 * pantalla y la ruta del PDF — así ambos parten del MISMO subconjunto y el
 * documento exportado refleja exactamente lo que se ve (ADR-047).
 */
export function filtrarVentas(
  ventas: readonly VentaReporte[],
  filtros: FiltrosPipeline
): VentaReporte[] {
  return ventas.filter((v) => {
    if (filtros.proyecto && v.proyectoId !== filtros.proyecto) return false;
    if (filtros.vendedor && v.vendedor !== filtros.vendedor) return false;
    if (filtros.mes && v.mes !== filtros.mes) return false;
    return true;
  });
}

export type PipelineFaseRow = {
  posicion: number;
  fase: string;
  rol: string | null;
  ventas: number;
  monto: number;
  /** Share del conteo total (0–1). */
  pctVentas: number;
  /** Share del monto total (0–1). */
  pctMonto: number;
};

export type PipelineFaseResult = {
  /** Una fila por fase del catálogo, ordenadas por posición (incluye las de 0). */
  filas: PipelineFaseRow[];
  totalVentas: number;
  totalMonto: number;
  /** Fase con más ventas activas (nombre) — para el KPI «cuello». */
  faseCuello: string | null;
};

/**
 * Construye el pipeline por fase. Recorre el catálogo en orden de posición
 * para incluir las 17 fases aunque alguna tenga 0 ventas (el embudo se lee
 * completo). Solo suma ventas en estado 'activa'.
 */
export function construirPipelinePorFase(
  fases: readonly FaseCatalogo[],
  ventas: readonly VentaPipeline[]
): PipelineFaseResult {
  const conteo = new Map<string, number>();
  const monto = new Map<string, number>();
  for (const v of ventas) {
    if (v.estado !== 'activa' || !v.fase_actual) continue;
    conteo.set(v.fase_actual, (conteo.get(v.fase_actual) ?? 0) + 1);
    monto.set(v.fase_actual, (monto.get(v.fase_actual) ?? 0) + (v.precio ?? 0));
  }

  const totalVentas = [...conteo.values()].reduce((a, b) => a + b, 0);
  const totalMonto = [...monto.values()].reduce((a, b) => a + b, 0);

  const filas: PipelineFaseRow[] = [...fases]
    .sort((a, b) => a.posicion - b.posicion)
    .map((f) => {
      const ventasFase = conteo.get(f.nombre) ?? 0;
      const montoFase = monto.get(f.nombre) ?? 0;
      return {
        posicion: f.posicion,
        fase: f.nombre,
        rol: f.rol,
        ventas: ventasFase,
        monto: montoFase,
        pctVentas: totalVentas === 0 ? 0 : ventasFase / totalVentas,
        pctMonto: totalMonto === 0 ? 0 : montoFase / totalMonto,
      };
    });

  // Fase cuello = la de mayor conteo (>0); tie-break por menor posición
  // (las filas ya vienen ordenadas, así que el primer máximo gana).
  let faseCuello: string | null = null;
  let max = 0;
  for (const fila of filas) {
    if (fila.ventas > max) {
      max = fila.ventas;
      faseCuello = fila.fase;
    }
  }

  return { filas, totalVentas, totalMonto, faseCuello };
}
