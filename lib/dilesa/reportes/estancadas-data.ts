/**
 * Tipos + normalización del reporte «Ventas estancadas» (ADR-047).
 *
 * Lee la vista `dilesa.v_ventas_pipeline_antiguedad` (días en fase calculados en
 * la base, ver migración 20260620164600). Módulo PURO; el vendedor se resuelve
 * aquí porque core.usuarios es self-only y no se puede joinear en la vista.
 */

export type EstancadaRaw = {
  venta_id: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  fecha_fase_actual: string | null;
  dias_en_fase: number | null;
  unidad_identificador: string | null;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  cliente: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  precio: number | null;
};

export type EstancadaRow = {
  ventaId: string;
  faseActual: string | null;
  fasePosicion: number | null;
  fechaFaseActual: string | null;
  diasEnFase: number;
  unidadIdentificador: string | null;
  proyectoId: string | null;
  proyectoNombre: string;
  cliente: string;
  vendedor: string | null;
  precio: number | null;
};

export type EstancadasBundle = {
  filas: readonly EstancadaRaw[];
  usuarios: ReadonlyArray<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;
};

export function normalizarEstancadas(b: EstancadasBundle): EstancadaRow[] {
  const usuarioMap = new Map(
    b.usuarios.map((u) => [
      u.id,
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || (u.email ?? ''),
    ])
  );
  return b.filas.map((r) => ({
    ventaId: r.venta_id,
    faseActual: r.fase_actual,
    fasePosicion: r.fase_posicion,
    fechaFaseActual: r.fecha_fase_actual,
    diasEnFase: r.dias_en_fase ?? 0,
    unidadIdentificador: r.unidad_identificador,
    proyectoId: r.proyecto_id,
    proyectoNombre: r.proyecto_nombre ?? '',
    cliente: r.cliente?.trim() || '(sin comprador)',
    vendedor: r.vendedor_usuario_id
      ? (usuarioMap.get(r.vendedor_usuario_id) ?? r.vendedor)
      : r.vendedor,
    precio: r.precio,
  }));
}

export function proyectosDeEstancadas(filas: readonly EstancadaRow[]): string[] {
  return [...new Set(filas.map((f) => f.proyectoNombre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}
