/**
 * Formato estándar de títulos y nombres de archivo para erp.documentos.
 *
 * Convención acordada: `{SLUG_UPPER}-{YYYY}-{M}-{TipoCorto}_{NUMERO}`
 *
 * Ejemplos:
 *   - `DILESA-2025-12-Escritura_574`
 *   - `DILESA-2022-8-Poder_208`
 *   - `DILESA-2021-10-Acta_121`
 *
 * El título se usa en la UI (tabla, detalle, buscador). El filename idéntico
 * +`.pdf` se usa al renombrar el archivo en el bucket cuando la extracción
 * IA confirma tipo/número y difiere del nombre actual.
 *
 * Si falta cualquiera de empresa/tipo/fecha/numero, `buildStandardTitulo`
 * devuelve null — el caller debe usar un placeholder y refinar después.
 */

const TIPO_TO_SHORT: Record<string, string> = {
  Escritura: 'Escritura',
  Contrato: 'Contrato',
  Seguro: 'Poliza',
  'Acta Constitutiva': 'Acta',
  Poder: 'Poder',
  Otro: 'Documento',
};

export type StandardTituloInput = {
  empresaSlug: string | null | undefined;
  tipo: string | null | undefined;
  /** ISO date string (YYYY-MM-DD) o similar — se parsea sin aplicar timezone. */
  fecha: string | null | undefined;
  /** Número de documento/escritura/acta. Acepta string o number. */
  numero: string | number | null | undefined;
};

function parseYearMonth(fecha: string): { year: number; month: number } | null {
  // Aceptamos 'YYYY-MM-DD' o 'YYYY-MM' o ISO timestamp. Parseamos la fecha
  // como local para evitar off-by-one cuando el valor viene en UTC medianoche
  // y el usuario está en zona negativa (MX).
  const match = /^(\d{4})-(\d{1,2})/.exec(fecha);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

function shortTipo(tipo: string): string {
  return TIPO_TO_SHORT[tipo] ?? tipo.replace(/\s+/g, '');
}

/**
 * Construye el título estándar o devuelve null si faltan datos esenciales.
 *
 * Regla: todos los campos (empresaSlug, tipo, fecha, numero) son requeridos.
 * Si cualquiera está ausente, devuelve null — el caller decide qué placeholder
 * poner hasta que IA complete.
 */
export function buildStandardTitulo({
  empresaSlug,
  tipo,
  fecha,
  numero,
}: StandardTituloInput): string | null {
  if (!empresaSlug || !tipo || !fecha || numero == null || numero === '') return null;

  const ym = parseYearMonth(fecha);
  if (!ym) return null;

  const slug = empresaSlug.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!slug) return null;

  const short = shortTipo(tipo);
  const numStr = String(numero).trim();
  if (!numStr) return null;

  return `${slug}-${ym.year}-${ym.month}-${short}_${numStr}`;
}

/** Mismo formato que el título, más extensión. Sanitiza para uso en filesystem. */
export function buildStandardFilename(titulo: string, ext = 'pdf'): string {
  // Quitamos caracteres peligrosos (Supabase Storage acepta UTF-8 pero
  // prefiero ASCII seguro para evitar problemas de encoding con fetch/gs).
  const safe = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-.]/g, '_')
    .replace(/_+/g, '_');
  return `${safe}.${ext}`;
}

/**
 * Placeholder sugerido para el título cuando todavía no tenemos datos
 * suficientes para el formato estándar. Se usa al crear un documento nuevo
 * antes de que IA lo procese.
 */
export function placeholderTitulo(empresaSlug: string | null | undefined): string {
  const slug = (empresaSlug ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return slug ? `${slug}-${date}-Documento por procesar` : `Documento por procesar — ${date}`;
}

/**
 * Devuelve true si el título ya está en formato estándar. Útil para decidir
 * si `onExtractionComplete` debe sobrescribir el título o dejarlo (respeta
 * cuando el usuario ya lo editó manualmente).
 */
export function isStandardTitulo(titulo: string | null | undefined): boolean {
  if (!titulo) return false;
  return /^[A-Z0-9]+-\d{4}-\d{1,2}-[A-Za-z]+_\S+$/.test(titulo);
}
