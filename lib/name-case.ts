/**
 * Utilidades de formateo de nombres propios para BSOP.
 *
 * **Política actualizada 2026-05-07**: BSOP normaliza todos los nombres
 * de personas a MAYÚSCULAS para alinearse con la convención mexicana de
 * SAT/CFDi/CONTPAQi. La normalización vive en el trigger DB
 * `erp.fn_personas_uppercase_normalize` — futuras altas y edits quedan
 * en mayúsculas automáticamente.
 *
 * Estas funciones quedan como **pass-through**: retornan los nombres tal
 * cual vienen de DB (en MAYÚSCULAS post-trigger) sin re-transformar el
 * casing. Históricamente aplicaban Title Case; ese paso se eliminó porque
 * la DB ya garantiza la normalización canónica y el Title Case en frontend
 * creaba la ilusión de que la DB no estaba en mayúsculas.
 *
 * Si en algún módulo específico se necesita Title Case para display
 * (ej. impresión de un documento que prefiera estilizar), implementarlo
 * localmente en ese caller — no aquí.
 */

/**
 * Pass-through: retorna el input tal cual (la DB ya garantiza MAYÚSCULAS
 * via trigger). Trim + colapsa espacios múltiples por higiene mínima.
 */
export function titleCase(input: string | null | undefined): string {
  if (!input) return '';
  return String(input).trim().replace(/\s+/g, ' ');
}

/**
 * Compone el nombre completo desde los 3 campos separados (como los
 * guarda `erp.personas`). NO transforma case — la DB tiene MAYÚSCULAS.
 * Solo concatena partes no-vacías separadas por espacio.
 */
export function composeFullName(
  nombre: string | null | undefined,
  apellidoPaterno?: string | null,
  apellidoMaterno?: string | null
): string {
  return [nombre, apellidoPaterno, apellidoMaterno]
    .map((s) => titleCase(s))
    .filter(Boolean)
    .join(' ');
}
