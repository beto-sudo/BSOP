/**
 * Calendario de días hábiles MX para auto-calcular fechas objetivo
 * de tareas en anteproyectos / desarrollos DILESA.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 3.
 *
 * Reglas:
 * - Días hábiles = lunes a viernes, excluyendo festivos nacionales MX.
 * - Festivos nacionales según LFT artículos 74 (movibles) y 78 (fijos).
 * - Mantenimiento anual: agregar el año siguiente cuando se acerque el
 *   límite de la lista. La regla blanda del repo (`CLAUDE.md`) cubre el
 *   tracking de stale.
 *
 * Si necesitamos cambiar festivos sin redeploy (cambios de calendario
 * por decreto, festivos de empresa, etc.), evaluamos mover esto a
 * `core.calendario_habil_mx` (tabla). Por ahora el JSON local basta y
 * evita una consulta a DB en cada cálculo de fecha objetivo.
 */

/** Festivos nacionales MX por año (YYYY-MM-DD). */
const FESTIVOS_MX: Record<number, readonly string[]> = {
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-02-02', // Día de la Constitución (1er lunes feb)
    '2026-03-16', // Natalicio Juárez (3er lunes mar)
    '2026-05-01', // Día del Trabajo
    '2026-09-16', // Día de la Independencia
    '2026-11-16', // Revolución Mexicana (3er lunes nov)
    '2026-12-25', // Navidad
  ],
  2027: [
    '2027-01-01',
    '2027-02-01',
    '2027-03-15',
    '2027-05-01',
    '2027-09-16',
    '2027-11-15',
    '2027-12-25',
  ],
  2028: [
    '2028-01-01',
    '2028-02-07',
    '2028-03-20',
    '2028-05-01',
    '2028-09-16',
    '2028-11-20',
    '2028-12-25',
  ],
  2029: [
    '2029-01-01',
    '2029-02-05',
    '2029-03-19',
    '2029-05-01',
    '2029-09-16',
    '2029-11-19',
    '2029-12-25',
  ],
  2030: [
    '2030-01-01',
    '2030-02-04',
    '2030-03-18',
    '2030-05-01',
    '2030-09-16',
    '2030-10-01', // Transmisión Poder Ejecutivo Federal (sexenal)
    '2030-11-18',
    '2030-12-25',
  ],
};

const FESTIVOS_SET: Set<string> = new Set(Object.values(FESTIVOS_MX).flat());

/**
 * Año más reciente con festivos definidos. Si se piden fechas fuera del
 * rango se asumen sin festivos (riesgo aceptable + warning en consola
 * en dev, ver `assertWithinRange`).
 */
const LAST_YEAR_WITH_DATA = Math.max(...Object.keys(FESTIVOS_MX).map(Number));

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formato YYYY-MM-DD desde un Date local. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parsea YYYY-MM-DD como medianoche local (no UTC). */
export function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

/** True si la fecha es sábado o domingo. */
export function esFinDeSemana(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** True si la fecha es festivo nacional MX. */
export function esFestivoMX(d: Date): boolean {
  return FESTIVOS_SET.has(toIsoDate(d));
}

/** True si la fecha es laborable (lun-vie, no festivo). */
export function esDiaHabil(d: Date): boolean {
  return !esFinDeSemana(d) && !esFestivoMX(d);
}

/**
 * Suma `dias` días hábiles a `desde`. Si `desde` cae en fin de semana
 * o festivo, primero avanza al siguiente hábil y luego cuenta.
 *
 * Ejemplo: `sumarDiasHabiles('2026-01-01', 5)` → 2026-01-09 porque
 * 2026-01-01 es jueves (festivo), salta al viernes 02, luego 5 días
 * hábiles = 02, 05, 06, 07, 08, 09 → último día = 2026-01-09.
 */
export function sumarDiasHabiles(desde: Date, dias: number): Date {
  if (dias < 0) throw new Error('sumarDiasHabiles: dias debe ser >= 0');

  const d = new Date(desde.getTime());
  // Avanza al primer día hábil >= desde.
  while (!esDiaHabil(d)) {
    d.setDate(d.getDate() + 1);
  }
  // Si dias=0 la fecha objetivo es "desde" (primer día hábil) — esto
  // representa "una tarea de duración 1 día que arranca y termina el
  // mismo día". Para duraciones > 1, agregamos (dias - 1) hábiles más.
  let restantes = Math.max(0, dias - 1);
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (esDiaHabil(d)) restantes--;
  }
  return d;
}

/**
 * Calcula el siguiente día hábil DESPUÉS de `desde`. Útil para
 * dependencias: la tarea Y arranca el día hábil siguiente al día en
 * que terminó la tarea X de la que depende.
 */
export function siguienteDiaHabil(desde: Date): Date {
  const d = new Date(desde.getTime());
  do {
    d.setDate(d.getDate() + 1);
  } while (!esDiaHabil(d));
  return d;
}

/**
 * Año cubierto por el calendario. Útil para validaciones / warnings
 * cuando se calculan fechas más allá del rango.
 */
export function ultimoAnioConFestivos(): number {
  return LAST_YEAR_WITH_DATA;
}
