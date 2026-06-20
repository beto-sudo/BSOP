/**
 * Tipos + normalización de ventas desasignadas para el reporte (ADR-047).
 *
 * Módulo PURO. Loader enfocado (solo `estado='desasignada'`, ~119 filas) para no
 * inflar el loader compartido de ventas con `motivo_desasignacion`/`updated_at`.
 */

export type DesasignadaRaw = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  motivo_desasignacion: string | null;
  /** Fecha real de desasignación (Coda / notas; backfill 2026-06-20). */
  fecha_desasignacion: string | null;
  updated_at: string | null;
  created_at: string;
};

export type DesasignadaRow = {
  id: string;
  cliente: string;
  unidadIdentificador: string | null;
  proyectoId: string | null;
  proyectoNombre: string;
  vendedor: string | null;
  motivo: string | null;
  precio: number | null;
  /** Fecha aproximada de desasignación (`updated_at`, último cambio). */
  fecha: string;
  /** Mes `YYYY-MM` de la fecha aproximada. */
  mes: string;
};

export type DesasignadasBundle = {
  ventas: readonly DesasignadaRaw[];
  unidades: ReadonlyArray<{ id: string; identificador: string | null; proyecto_id: string | null }>;
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  personas: ReadonlyArray<{
    id: string;
    nombre: string | null;
    apellido_paterno: string | null;
    apellido_materno: string | null;
  }>;
  usuarios: ReadonlyArray<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;
};

export const DESASIGNADAS_SELECT =
  'id, persona_id, unidad_id, vendedor, vendedor_usuario_id, valor_escrituracion, valor_comercial, motivo_desasignacion, fecha_desasignacion, updated_at, created_at';

export function normalizarDesasignadas(b: DesasignadasBundle): DesasignadaRow[] {
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
  const usuarioMap = new Map(
    b.usuarios.map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.email ?? ''),
    ])
  );

  return b.ventas.map((v) => {
    const u = v.unidad_id ? unidadMap.get(v.unidad_id) : null;
    // Fecha REAL de desasignación (Coda/notas, backfill); fallback al timestamp
    // genérico solo si una fila quedara sin poblar.
    const fecha = (v.fecha_desasignacion ?? v.updated_at ?? v.created_at).slice(0, 10);
    return {
      id: v.id,
      cliente: personaMap.get(v.persona_id) ?? '(sin comprador)',
      unidadIdentificador: u?.identificador ?? null,
      proyectoId: u?.proyectoId ?? null,
      proyectoNombre: u?.proyectoId ? (proyectoMap.get(u.proyectoId) ?? '') : '',
      vendedor: v.vendedor_usuario_id
        ? (usuarioMap.get(v.vendedor_usuario_id) ?? v.vendedor)
        : v.vendedor,
      motivo: v.motivo_desasignacion?.trim() || null,
      precio: v.valor_escrituracion ?? v.valor_comercial,
      fecha,
      mes: fecha.slice(0, 7),
    };
  });
}

export function proyectosDeDesasignadas(filas: readonly DesasignadaRow[]): string[] {
  return [...new Set(filas.map((f) => f.proyectoNombre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}
