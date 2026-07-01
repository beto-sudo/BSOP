/**
 * Motor del reporte «Unidades escriturables» (DILESA · Ventas) — ADR-047.
 *
 * Filtra las candidatas (proyecto / situación / solo-escriturables) y deriva
 * el resumen del embudo: cuántas ya se pueden firmar y qué detiene al resto
 * (extracción del RUV pendiente vs obra en proceso). Puro y testeable.
 */
import type { UnidadEscriturableRow } from './escriturables-data';

export type FiltrosEscriturables = {
  proyecto: string;
  situacion: '' | 'inventario' | 'asignada';
  /** `'escriturables'` (default) = solo las listas; `'todas'` = todo el universo candidato. */
  mostrar: 'escriturables' | 'todas';
};

export const FILTROS_ESCRITURABLES_DEFAULT: FiltrosEscriturables = {
  proyecto: '',
  situacion: '',
  mostrar: 'escriturables',
};

export type EscriturablesResult = {
  /** Filas visibles según `mostrar`, ordenadas por proyecto e identificador. */
  unidades: UnidadEscriturableRow[];
  /** Candidatas tras proyecto/situación (base de los KPIs, ignora `mostrar`). */
  totalCandidatas: number;
  escriturables: number;
  /** Escriturables en inventario (se pueden vender + firmar de inmediato). */
  enInventario: number;
  /** Escriturables ya asignadas a un cliente (falta que la venta llegue a firma). */
  asignadas: number;
  /** Obra terminada pero sin extracción del RUV — el trámite es lo que detiene. */
  faltaExtraccion: number;
  /** Obra sin terminar — la construcción es lo que detiene. */
  obraEnProceso: number;
};

export function construirUnidadesEscriturables(
  rows: readonly UnidadEscriturableRow[],
  filtros: FiltrosEscriturables
): EscriturablesResult {
  const candidatas = rows.filter((r) => {
    if (filtros.proyecto && r.proyectoNombre !== filtros.proyecto) return false;
    if (filtros.situacion && r.situacion !== filtros.situacion) return false;
    return true;
  });

  const visibles =
    filtros.mostrar === 'todas' ? candidatas : candidatas.filter((r) => r.escriturable);
  const lista = [...visibles].sort(
    (a, b) =>
      a.proyectoNombre.localeCompare(b.proyectoNombre, 'es') ||
      a.identificadorCompleto.localeCompare(b.identificadorCompleto, 'es')
  );

  const escriturables = candidatas.filter((r) => r.escriturable);

  return {
    unidades: lista,
    totalCandidatas: candidatas.length,
    escriturables: escriturables.length,
    enInventario: escriturables.filter((r) => r.situacion === 'inventario').length,
    asignadas: escriturables.filter((r) => r.situacion === 'asignada').length,
    faltaExtraccion: candidatas.filter((r) => r.obraTerminada && r.fechaExtraccion == null).length,
    obraEnProceso: candidatas.filter((r) => !r.obraTerminada).length,
  };
}

/** Etiqueta de estatus por fila (vista y PDF comparten el texto). */
export function estatusEscriturable(r: UnidadEscriturableRow): string {
  if (r.escriturable) return 'Escriturable';
  if (!r.obraTerminada) return 'Obra en proceso';
  return 'Falta extracción';
}
