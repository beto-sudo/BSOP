/**
 * Utilidades de formateo de nombres propios para BSOP.
 *
 * Beto migró datos desde Coda/IMSS donde muchos nombres vienen TODOS EN
 * MAYÚSCULAS. El estándar de BSOP es Title Case: primera letra de cada
 * palabra en mayúscula, el resto en minúscula — respetando preposiciones
 * comunes en español ("de", "la", "del", "y") que quedan en minúscula
 * cuando no son la primera palabra.
 *
 * Aplicar en:
 *   - UI de entry/edit antes de guardar (nuevos nombres siempre quedan limpios).
 *   - Backfills SQL one-shot para datos históricos en mayúsculas.
 */

const LOWERCASE_PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'van',
  'von',
  'der',
  'den',
]);

/**
 * Convierte un nombre propio a Title Case preservando partículas en minúscula
 * cuando no son la primera palabra.
 *
 *   titleCase('ADALBERTO SANTOS DE LOS SANTOS')
 *     → 'Adalberto Santos de los Santos'
 *   titleCase('maria josé de la peña')
 *     → 'Maria José de la Peña'
 *   titleCase("O'CONNOR")
 *     → "O'Connor"
 *
 * Limitaciones: no intenta preservar siglas (e.g. "JR", "III") — los trata
 * como palabras normales. Si un nombre tiene abreviaturas, hay que
 * manualizar el Title Case después.
 */
export function titleCase(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  const words = raw.split(' ');
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && LOWERCASE_PARTICLES.has(lower)) return lower;
      return capitalizeWord(word);
    })
    .join(' ');
}

/**
 * Capitaliza una palabra respetando sub-partes separadas por apóstrofo
 * (O'Connor) o guion (Jean-Luc).
 */
function capitalizeWord(word: string): string {
  if (!word) return word;
  return word
    .split(/(['’-])/)
    .map((part) => {
      if (part === "'" || part === '’' || part === '-') return part;
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('es') + part.slice(1).toLocaleLowerCase('es');
    })
    .join('');
}

/**
 * Compone el nombre completo desde los 3 campos separados (como los guarda
 * `erp.personas`). Aplica `titleCase` a cada parte por si la fuente vino en
 * mayúsculas, y filtra partes vacías.
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
