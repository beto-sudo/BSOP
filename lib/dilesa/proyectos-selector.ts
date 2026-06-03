/**
 * Helper compartido para los selectores de proyecto DILESA (forms de captura).
 *
 * Regla (iniciativa dilesa-contratos-obra, 2026-06-03): un proyecto puede
 * existir como `anteproyecto` y, al ganar, promoverse a `desarrollo` — una fila
 * nueva ligada al anteproyecto por `proyecto_predecesor_id`. En un selector de
 * captura eso se ve como un duplicado por nombre. Criterio acordado con Beto:
 *
 *  - **Desarrollos** → se muestran (son los proyectos).
 *  - **Anteproyectos NO convertidos** → se muestran etiquetados (sí se
 *    presupuesta/contrata en fase de anteproyecto); `esAnteproyecto = true`.
 *  - **Anteproyectos YA convertidos** (su id es `proyecto_predecesor_id` de
 *    algún desarrollo) → se omiten: cualquier captura va sobre el desarrollo
 *    sucesor, así desaparece el duplicado.
 *
 * Helper PURO (sin fetch) para ser testeable y reutilizable desde cualquier
 * form. El SELECT debe traer `id, nombre, tipo, proyecto_predecesor_id`.
 */

export type ProyectoSelectorRow = {
  id: string;
  nombre: string | null;
  tipo: string | null;
  proyecto_predecesor_id: string | null;
};

export type ProyectoOption = {
  id: string;
  nombre: string;
  /** true cuando el proyecto es un anteproyecto (la UI lo etiqueta). */
  esAnteproyecto: boolean;
};

/**
 * Construye la lista de opciones para un selector de proyecto de captura,
 * ordenada por nombre. Omite los anteproyectos ya convertidos a desarrollo.
 */
export function buildProyectoOptions(rows: readonly ProyectoSelectorRow[]): ProyectoOption[] {
  // ids de anteproyectos que ya tienen un desarrollo sucesor.
  const convertidos = new Set<string>();
  for (const p of rows) {
    if (p.proyecto_predecesor_id) convertidos.add(p.proyecto_predecesor_id);
  }

  const out: ProyectoOption[] = [];
  for (const p of rows) {
    const esAnteproyecto = p.tipo === 'anteproyecto';
    if (esAnteproyecto && convertidos.has(p.id)) continue; // ya convertido → va sobre el desarrollo
    out.push({ id: p.id, nombre: p.nombre ?? '', esAnteproyecto });
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return out;
}

/** Etiqueta de display: nombre + sufijo "(anteproyecto)" cuando aplica. */
export function proyectoOptionLabel(o: ProyectoOption): string {
  return o.esAnteproyecto ? `${o.nombre} (anteproyecto)` : o.nombre;
}
