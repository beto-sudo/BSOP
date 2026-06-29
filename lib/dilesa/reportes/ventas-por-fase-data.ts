/**
 * Tipos + normalización del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047.
 *
 * Grano: un REGISTRO de fase de `dilesa.venta_fases` (una venta alcanzó una
 * fase, con la fecha en que se registró su terminación). El reporte cuenta las
 * ventas que entraron a la fase seleccionada en un periodo, tomando
 * `venta_fases.fecha`. Generaliza el caso «detonadas» (fase 12) a las 17 fases:
 * 17 reportes en uno, gobernados por el filtro `posicion`.
 *
 * Módulo PURO (sin Supabase ni React): lo comparten el hook del browser
 * (`use-ventas-por-fase-reporte`) y el loader server (`ventas-por-fase-data-server`,
 * rutas PDF/CSV). `normalizarVentasPorFase` deriva el shape una sola vez →
 * paridad pantalla ↔ PDF ↔ CSV.
 */
import { nombreFase } from '@/lib/dilesa/fases';

/** Registro de fase normalizado con los campos que consume el reporte. */
export type VentaFaseReporteRow = {
  /** Id del registro de fase (`venta_fases.id`). */
  id: string;
  ventaId: string;
  /** Fecha en que se registró la terminación de la fase `YYYY-MM-DD`. */
  fecha: string;
  /** Mes del registro `YYYY-MM` (agrupador). */
  mes: string;
  /** Posición de la fase (1–17). */
  posicion: number;
  /** Nombre/estado de la fase. */
  faseNombre: string;
  cliente: string;
  proyectoId: string | null;
  proyectoNombre: string;
  unidadIdentificador: string | null;
  tipoCredito: string | null;
  vendedor: string | null;
  /** Fase actual de la venta hoy (puede ser > la del registro). */
  faseActualVenta: string | null;
  estadoVenta: string | null;
  /** Valor comercial de la venta (precio de asignación, o comercial de respaldo). */
  valor: number;
};

export type VentaFaseRaw = {
  id: string;
  venta_id: string;
  posicion: number | null;
  fecha: string | null;
};

export type VentaFaseVentaRaw = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  tipo_credito: string | null;
  vendedor: string | null;
  fase_actual: string | null;
  estado: string | null;
  valor_comercial: number | null;
  precio_asignacion: number | null;
};

export type VentasPorFaseRawBundle = {
  fases: readonly VentaFaseRaw[];
  ventas: ReadonlyArray<VentaFaseVentaRaw>;
  unidades: ReadonlyArray<{ id: string; identificador: string | null; proyecto_id: string | null }>;
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  personas: ReadonlyArray<{
    id: string;
    nombre: string | null;
    apellido_paterno: string | null;
    apellido_materno: string | null;
  }>;
};

/** SELECT de registros de fase (mantener en sync con VentaFaseRaw). */
export const VENTA_FASES_SELECT = 'id, venta_id, posicion, fecha';

/** SELECT de ventas para el reporte de fases (mantener en sync con VentaFaseVentaRaw). */
export const VENTAS_FASE_SELECT =
  'id, persona_id, unidad_id, tipo_credito, vendedor, fase_actual, estado, valor_comercial, precio_asignacion';

/**
 * Normaliza el bundle crudo a filas de reporte. Pura: la usan tanto el fetch
 * del browser como el del server (misma derivación → paridad pantalla/PDF/CSV).
 * Descarta registros sin fecha (no tienen fecha de registro contra la cual
 * filtrar) o sin posición.
 */
export function normalizarVentasPorFase(b: VentasPorFaseRawBundle): VentaFaseReporteRow[] {
  const ventaMap = new Map(b.ventas.map((v) => [v.id, v]));
  const unidadMap = new Map(
    b.unidades.map((u) => [u.id, { identificador: u.identificador, proyectoId: u.proyecto_id }])
  );
  const proyectoMap = new Map(b.proyectos.map((p) => [p.id, p.nombre]));
  const personaMap = new Map(
    b.personas.map((p) => [
      p.id,
      [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
        '(sin nombre)',
    ])
  );

  const filas: VentaFaseReporteRow[] = [];
  for (const f of b.fases) {
    if (!f.fecha || f.posicion == null) continue;
    const venta = ventaMap.get(f.venta_id);
    if (!venta) continue;
    const u = venta.unidad_id ? unidadMap.get(venta.unidad_id) : null;
    filas.push({
      id: f.id,
      ventaId: f.venta_id,
      fecha: f.fecha,
      mes: f.fecha.slice(0, 7),
      posicion: f.posicion,
      faseNombre: nombreFase(f.posicion),
      cliente: personaMap.get(venta.persona_id) ?? '(sin comprador)',
      proyectoId: u?.proyectoId ?? null,
      proyectoNombre: u?.proyectoId ? (proyectoMap.get(u.proyectoId) ?? '') : '',
      unidadIdentificador: u?.identificador ?? null,
      tipoCredito: venta.tipo_credito,
      vendedor: venta.vendedor,
      faseActualVenta: venta.fase_actual,
      estadoVenta: venta.estado,
      valor: venta.precio_asignacion ?? venta.valor_comercial ?? 0,
    });
  }
  return filas;
}

/**
 * Proyectos presentes EN LOS REGISTROS (para el selector de filtro), únicos por
 * id y ordenados por nombre. Simétrico con `proyectosDepositos`.
 */
export function proyectosVentasPorFase(
  filas: readonly VentaFaseReporteRow[]
): Array<{ id: string; nombre: string }> {
  const porId = new Map<string, string>();
  for (const f of filas) {
    if (f.proyectoId && f.proyectoNombre) porId.set(f.proyectoId, f.proyectoNombre);
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
