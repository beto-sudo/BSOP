/**
 * Normalización de nombres propios en español (RAE).
 *
 * Regla general:
 *   - Primera letra de cada palabra en mayúscula
 *   - Preposiciones, artículos y conjunciones cortas en minúscula
 *     (excepto cuando son la primera palabra)
 *   - Abreviaturas comunes (Lic., Dr., Ma.) mantienen su forma
 *   - Siglas conocidas (IMSS, ISR, etc.) se ponen en mayúscula
 *   - Iniciales de una sola letra ("J.") se ponen en mayúscula
 *
 * Uso típico: normalizar nombres de personas (notarios, representantes) que
 * se capturaron en mayúscula/minúscula inconsistente.
 *
 * Limitación consciente: **no añadimos acentos faltantes**. Si el nombre
 * original dice "lopez" no lo convertimos a "López" — eso requiere un
 * diccionario y corre el riesgo de meter falsos positivos. El admin puede
 * corregirlos a mano desde la UI de editar.
 */

// Preposiciones / artículos / conjunciones que van en minúscula, salvo cuando
// son la primera palabra de la cadena.
const LOWER_WORDS = new Set([
  'a',
  'al',
  'ante',
  'bajo',
  'con',
  'contra',
  'de',
  'del',
  'desde',
  'e',
  'el',
  'en',
  'entre',
  'hacia',
  'hasta',
  'la',
  'las',
  'los',
  'ni',
  'o',
  'para',
  'por',
  'sin',
  'so',
  'sobre',
  'tras',
  'u',
  'un',
  'una',
  'y',
]);

// Siglas/acrónimos comunes en nombres de organizaciones e instituciones
// mexicanas. Ampliable — si un nombre trae algo nuevo, agrégalo acá.
const ACRONYMS = new Set([
  'IMSS',
  'ISSSTE',
  'INFONAVIT',
  'SAT',
  'INE',
  'SEP',
  'IFAI',
  'INAI',
  'CONAGUA',
  'CFE',
  'DIF',
  'UNAM',
  'IPN',
  'ITESM',
  'UANL',
  'UAT',
  'RFC',
  'CURP',
  'AC',
  'SA',
  'SC',
  'SRL',
  'CV',
  'SAPI',
  'SOFOM',
]);

// Abreviaturas comunes que ya llevan punto y capitalización estándar.
// Lista en minúscula; el output lleva primera letra en mayúscula.
const ABBREVIATIONS = new Set([
  'lic.',
  'dr.',
  'dra.',
  'mtro.',
  'mtra.',
  'ing.',
  'arq.',
  'sr.',
  'sra.',
  'srta.',
  'cp.',
  'c.p.',
  'ma.',
  'mo.',
  'no.',
  'sto.',
  'sta.',
  'fr.',
]);

function capitalizeFirst(word: string): string {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase('es-MX') + word.slice(1).toLocaleLowerCase('es-MX');
}

/**
 * Aplica Title Case según convenciones RAE a un nombre propio.
 *
 * @example
 *   titleCaseEs('lic. guillermo lopez elizondo')
 *   // → 'Lic. Guillermo Lopez Elizondo'
 *
 *   titleCaseEs('lic. ma. inmaculada del rosario martinez ortegón')
 *   // → 'Lic. Ma. Inmaculada del Rosario Martinez Ortegón'
 *
 *   titleCaseEs('notaria 10 imss')
 *   // → 'Notaria 10 IMSS'
 */
export function titleCaseEs(input: string | null | undefined): string {
  if (!input) return '';
  const normalized = input.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  const words = normalized.split(' ');
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('es-MX');

      // Siglas conocidas — todo en mayúscula.
      if (/^[a-zá-úñ]+$/i.test(word) && ACRONYMS.has(word.toUpperCase())) {
        return word.toUpperCase();
      }

      // Abreviaturas comunes (lic., dra., ma., etc.).
      if (ABBREVIATIONS.has(lower)) {
        return capitalizeFirst(lower);
      }

      // Inicial de una sola letra con o sin punto: "j." / "j" → "J." / "J".
      if (/^[a-zá-úñ]\.?$/i.test(word)) {
        return word.toUpperCase();
      }

      // Tokens con punto intermedio (iniciales compuestas: "j.a." o similar).
      if (/^[a-zá-úñ](\.[a-zá-úñ])+\.?$/i.test(word)) {
        return word.toUpperCase();
      }

      // Preposiciones/artículos: minúscula salvo si son la primera palabra.
      if (index > 0 && LOWER_WORDS.has(lower)) {
        return lower;
      }

      // Caso general: primera letra mayúscula, resto minúsculas.
      // Manejo especial para palabras con guión (ej. "rocha-perez" → "Rocha-Perez").
      if (word.includes('-')) {
        return word
          .split('-')
          .map((chunk) => capitalizeFirst(chunk.toLocaleLowerCase('es-MX')))
          .join('-');
      }

      return capitalizeFirst(lower);
    })
    .join(' ');
}
