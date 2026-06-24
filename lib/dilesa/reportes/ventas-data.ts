/**
 * Tipos + normalización de datos de Ventas para reportes (ADR-047).
 *
 * Módulo PURO (sin imports de Supabase ni React) para que lo puedan consumir
 * por igual el hook del browser (`use-ventas-reporte`), el loader server
 * (`ventas-data-server`, rutas de PDF) y los motores/PDFs. `normalizarVentas`
 * deriva el shape de reporte una sola vez → paridad pantalla↔PDF.
 *
 * Nota: `pipeline-por-fase` (Sprint 1) trae su propio fetch acotado; cuando se
 * unifique, adoptará este loader. No se toca para no arriesgar lo ya aprobado.
 */

/** Venta normalizada con los campos que consumen los reportes de Ventas. */
export type VentaReporteRow = {
  id: string;
  estado: string;
  faseActual: string | null;
  fasePosicion: number | null;
  /** Precio efectivo: `valor_escrituracion ?? valor_comercial`. */
  precio: number | null;
  numeroEscritura: string | null;
  fechaEscritura: string | null;
  proyectoId: string | null;
  proyectoNombre: string;
  unidadIdentificador: string | null;
  cliente: string;
  vendedor: string | null;
  tipoCredito: string | null;
  /** Fecha de firma programada `YYYY-MM-DD` (fase 10; null si no agendada). */
  fechaFirmaProgramada: string | null;
  /** Hora de firma programada (null si no agendada). */
  horaFirmaProgramada: string | null;
  /** Mes de creación `YYYY-MM`. */
  mesCreacion: string;
  /** Mes de escrituración `YYYY-MM` (null si no ha escriturado). */
  mesEscritura: string | null;
};

export type VentaRaw = {
  id: string;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  unidad_id: string | null;
  persona_id: string;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  tipo_credito: string | null;
  fecha_firma_programada: string | null;
  hora_firma_programada: string | null;
  created_at: string;
};

export type VentasRawBundle = {
  ventas: readonly VentaRaw[];
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

/** El SELECT de ventas que necesitan los reportes (mantener en sync con VentaRaw). */
export const VENTAS_SELECT =
  'id, estado, fase_actual, fase_posicion, valor_escrituracion, valor_comercial, unidad_id, persona_id, numero_escritura, fecha_escritura, vendedor, vendedor_usuario_id, tipo_credito, fecha_firma_programada, hora_firma_programada, created_at';

/**
 * Normaliza el bundle crudo a filas de reporte. Pura: la usan tanto el fetch
 * del browser como el del server (misma derivación → paridad pantalla/PDF).
 */
export function normalizarVentas(b: VentasRawBundle): VentaReporteRow[] {
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
    return {
      id: v.id,
      estado: v.estado,
      faseActual: v.fase_actual,
      fasePosicion: v.fase_posicion,
      precio: v.valor_escrituracion ?? v.valor_comercial,
      numeroEscritura: v.numero_escritura,
      fechaEscritura: v.fecha_escritura,
      proyectoId: u?.proyectoId ?? null,
      proyectoNombre: u?.proyectoId ? (proyectoMap.get(u.proyectoId) ?? '') : '',
      unidadIdentificador: u?.identificador ?? null,
      cliente: personaMap.get(v.persona_id) ?? '(sin comprador)',
      vendedor: v.vendedor_usuario_id
        ? (usuarioMap.get(v.vendedor_usuario_id) ?? v.vendedor)
        : v.vendedor,
      tipoCredito: v.tipo_credito,
      fechaFirmaProgramada: v.fecha_firma_programada,
      horaFirmaProgramada: v.hora_firma_programada,
      mesCreacion: v.created_at.slice(0, 7),
      mesEscritura: v.fecha_escritura ? v.fecha_escritura.slice(0, 7) : null,
    };
  });
}

/**
 * Proyectos presentes EN LAS VENTAS (para el selector de filtro), únicos por id
 * y ordenados por nombre.
 *
 * Se deriva del propio dataset y NO del catálogo completo `dilesa.proyectos` a
 * propósito: el catálogo trae nombres duplicados (cascarones de import sin
 * inventario ni ventas, p.ej. dos «Lomas de las Delicias») que ensuciaban el
 * filtro con opciones repetidas. Derivando de las ventas, solo aparece el
 * proyecto que realmente tiene ventas — sin duplicados y sin proyectos vacíos.
 * Es simétrico con `vendedoresPresentes`. El value sigue siendo el `id`, así que
 * el filtrado por `proyectoId` en los motores no cambia.
 */
export function proyectosPresentes(
  ventas: readonly VentaReporteRow[]
): Array<{ id: string; nombre: string }> {
  const porId = new Map<string, string>();
  for (const v of ventas) {
    if (v.proyectoId && v.proyectoNombre) porId.set(v.proyectoId, v.proyectoNombre);
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Vendedores presentes en las ventas (para el selector), únicos y ordenados. */
export function vendedoresPresentes(ventas: readonly VentaReporteRow[]): string[] {
  return [...new Set(ventas.map((v) => v.vendedor).filter((x): x is string => !!x))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}
