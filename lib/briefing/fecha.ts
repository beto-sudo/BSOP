/**
 * Fecha local de Matamoros para el briefing (iniciativa
 * `daily-briefing-automation`). Matamoros SÍ observa DST; estos formatos salen
 * de la TZ real, así que el día/fecha son correctos todo el año. Pura.
 */

const TZ = 'America/Matamoros';

export function matamorosFecha(now: Date): { iso: string; diaSemana: string; larga: string } {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const diaSemana = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, weekday: 'long' }).format(now);
  const larga = new Intl.DateTimeFormat('es-MX', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { iso, diaSemana, larga };
}
