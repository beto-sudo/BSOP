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
