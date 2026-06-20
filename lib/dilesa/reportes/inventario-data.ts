/**
 * Tipos + normalización de datos de Inventario para reportes (ADR-047).
 *
 * Módulo PURO. El reporte de inventario disponible usa el MISMO criterio que el
 * módulo Inventario (`components/dilesa/inventario-module.tsx`): unidades
 * vendibles hoy = `estado IN ('en_construccion','terminada')`, `activo_id IS NULL`
 * (no liberadas al portafolio) y `es_muestra = false`. El fetch (browser/server)
 * ya aplica ese filtro; aquí solo se resuelven proyecto y prototipo.
 */

export type UnidadRaw = {
  id: string;
  estado: string;
  proyecto_id: string | null;
  producto_id: string | null;
};

export type UnidadDisponible = {
  id: string;
  estado: string;
  proyectoId: string | null;
  proyectoNombre: string;
  prototipo: string | null;
};

export type UnidadesBundle = {
  unidades: readonly UnidadRaw[];
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  productos: ReadonlyArray<{ id: string; nombre: string }>;
};

/** Filtro del query de unidades vendibles (idéntico al módulo Inventario). */
export const UNIDADES_DISPONIBLES_SELECT = 'id, estado, proyecto_id, producto_id';
export const ESTADOS_DISPONIBLES = ['en_construccion', 'terminada'] as const;

export function normalizarUnidades(b: UnidadesBundle): UnidadDisponible[] {
  const proyectoMap = new Map(b.proyectos.map((p) => [p.id, p.nombre]));
  const productoMap = new Map(b.productos.map((p) => [p.id, p.nombre]));
  return b.unidades.map((u) => ({
    id: u.id,
    estado: u.estado,
    proyectoId: u.proyecto_id,
    proyectoNombre: u.proyecto_id ? (proyectoMap.get(u.proyecto_id) ?? '') : '',
    prototipo: u.producto_id ? (productoMap.get(u.producto_id) ?? null) : null,
  }));
}

/** Proyectos presentes en las unidades (para el selector), únicos y ordenados. */
export function proyectosDeUnidades(unidades: readonly UnidadDisponible[]): string[] {
  return [...new Set(unidades.map((u) => u.proyectoNombre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

/** Prototipos presentes en las unidades (para el selector), únicos y ordenados. */
export function prototiposDeUnidades(unidades: readonly UnidadDisponible[]): string[] {
  return [...new Set(unidades.map((u) => u.prototipo).filter((p): p is string => !!p))].sort(
    (a, b) => a.localeCompare(b, 'es')
  );
}
