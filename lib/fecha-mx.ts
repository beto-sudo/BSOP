/**
 * Fecha calendario (YYYY-MM-DD) en horario local de Matamoros, con DST real.
 *
 * Matamoros es zona fronteriza y SÍ observa horario de verano (CDT, UTC-5) e
 * invierno (CST, UTC-6) siguiendo a EE.UU.; por eso no usamos un offset fijo —
 * `Intl` resuelve el offset correcto según la fecha. El locale `en-CA` formatea
 * la fecha como `YYYY-MM-DD`, justo el shape que comparamos contra columnas
 * `date` capturadas localmente (p.ej. la fecha de entrada a una fase en
 * `dilesa.venta_fases`).
 *
 * Es el complemento de `relojMatamoros` (que da hora/día de semana): este da la
 * fecha calendario. Crítico cerca de medianoche local — a las 20:00 de Matamoros
 * el `Date` en UTC ya es el día siguiente, así que un `toISOString().slice(0,10)`
 * daría "mañana". Cf. memoria `reference_vercel_cron_dst_matamoros`.
 */
export function fechaISOMatamoros(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Primer día (`YYYY-MM-01`) del mes calendario ACTUAL en horario de Matamoros.
 * Default de los filtros de reportes que abren mostrando «lo que va del mes»
 * (depósitos del periodo, ventas por fase). Se deriva de `fechaISOMatamoros`
 * para respetar el corte de medianoche local y el DST fronterizo.
 */
export function inicioMesMatamoros(d: Date = new Date()): string {
  return `${fechaISOMatamoros(d).slice(0, 7)}-01`;
}

/**
 * "Hoy" (`YYYY-MM-DD`) en horario de Matamoros. Reemplazo directo del
 * antipatrón `new Date().toISOString().slice(0, 10)` — que devuelve el día
 * UTC (también en el navegador) y a partir de las 18:00/19:00 locales ya es
 * "mañana". Default canónico para capturas de fecha y nombres de archivo.
 * Guard de lint: `no-restricted-syntax` en `eslint.config.mjs` (iniciativa
 * fechas-tz).
 */
export function hoyISOMatamoros(): string {
  return fechaISOMatamoros(new Date());
}

/** Formatea componentes UTC de un Date como `YYYY-MM-DD` (sin toISOString). */
function isoDeUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Suma días de calendario a una fecha `YYYY-MM-DD` (aritmética pura, sin TZ:
 * el string se interpreta y se re-formatea en UTC, así que no hay corrimiento).
 */
export function sumarDiasISO(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return isoDeUTC(new Date(Date.UTC(y, m - 1, d + dias)));
}

/**
 * Resta meses de calendario a una fecha `YYYY-MM-DD` (aritmética pura, sin
 * TZ). `Date.UTC` resuelve el rollover (ej. 2026-01-15 − 3m → 2025-10-15).
 */
export function restarMesesISO(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return isoDeUTC(new Date(Date.UTC(y, m - 1 - meses, d)));
}
