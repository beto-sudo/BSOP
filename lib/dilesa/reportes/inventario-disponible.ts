/**
 * Motor del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 *
 * Agrupa las unidades vendibles por proyecto + prototipo, con el desglose
 * en construcción / terminadas. Es el panorama de "qué tengo para ofrecer y
 * dónde". Pura y testeable; la comparten la vista y el PDF.
 */
import type { UnidadDisponible } from './inventario-data';

export type FiltrosInventario = { proyecto: string; prototipo: string };

export const FILTROS_INVENTARIO_VACIOS: FiltrosInventario = { proyecto: '', prototipo: '' };

export type GrupoInventario = {
  proyecto: string;
  prototipo: string;
  disponibles: number;
  enConstruccion: number;
  terminadas: number;
};

export type InventarioResult = {
  /** Una fila por (proyecto, prototipo), ordenada por proyecto y luego prototipo. */
  grupos: GrupoInventario[];
  totalDisponibles: number;
  totalEnConstruccion: number;
  totalTerminadas: number;
  /** Cuántos proyectos distintos tienen inventario. */
  totalProyectos: number;
};

const SIN_PROTOTIPO = '(sin prototipo)';

export function construirInventarioDisponible(
  unidades: readonly UnidadDisponible[],
  filtros: FiltrosInventario
): InventarioResult {
  const filtradas = unidades.filter((u) => {
    if (filtros.proyecto && u.proyectoNombre !== filtros.proyecto) return false;
    if (filtros.prototipo && (u.prototipo ?? SIN_PROTOTIPO) !== filtros.prototipo) return false;
    return true;
  });

  const map = new Map<string, GrupoInventario>();
  const proyectosSet = new Set<string>();
  for (const u of filtradas) {
    const proyecto = u.proyectoNombre || '(sin proyecto)';
    const prototipo = u.prototipo ?? SIN_PROTOTIPO;
    proyectosSet.add(proyecto);
    const key = `${proyecto}::${prototipo}`;
    const cur = map.get(key) ?? {
      proyecto,
      prototipo,
      disponibles: 0,
      enConstruccion: 0,
      terminadas: 0,
    };
    cur.disponibles += 1;
    if (u.estado === 'en_construccion') cur.enConstruccion += 1;
    else if (u.estado === 'terminada') cur.terminadas += 1;
    map.set(key, cur);
  }

  const grupos = [...map.values()].sort(
    (a, b) =>
      a.proyecto.localeCompare(b.proyecto, 'es') || a.prototipo.localeCompare(b.prototipo, 'es')
  );

  return {
    grupos,
    totalDisponibles: filtradas.length,
    totalEnConstruccion: filtradas.filter((u) => u.estado === 'en_construccion').length,
    totalTerminadas: filtradas.filter((u) => u.estado === 'terminada').length,
    totalProyectos: proyectosSet.size,
  };
}
