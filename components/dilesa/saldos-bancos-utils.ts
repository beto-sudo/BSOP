/**
 * Helpers puros del módulo Saldos Bancos (iniciativa `tesoreria`).
 *
 * Separados del componente para poder testearlos sin montar React y para que
 * tanto el módulo como sus tests los compartan.
 */

export type Moneda = 'MXN' | 'USD';

export type CuentaSaldoRow = {
  cuentaId: string;
  nombre: string;
  banco: string | null;
  moneda: Moneda;
  /** Último saldo conocido (de `v_cuenta_saldo_actual`); null si nunca se capturó. */
  saldo: number | null;
  /** Fecha del último snapshot (date-only `YYYY-MM-DD`); null si no hay. */
  fechaSaldo: string | null;
  /** Timestamp del último snapshot; null si no hay. */
  capturadoAt: string | null;
};

/**
 * Infiere la moneda de una cuenta desde su nombre/banco.
 *
 * Las cuentas DILESA se cargaron en Sprint 1 sin `moneda_id` (viene null), así
 * que la única señal disponible es el nombre: "BBVA Bancomer Dólares" → USD.
 * Detección accent/case-insensitive de "dolar"/"dólar"/"usd". Default MXN.
 *
 * Cuando `conciliacion-bancaria` o una captura futura pueble `moneda_id` real,
 * este heurístico se reemplaza por el lookup del catálogo de monedas.
 */
export function monedaDeCuenta(nombre: string | null, banco?: string | null): Moneda {
  const haystack = `${nombre ?? ''} ${banco ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos: "Dólares" → "Dolares"
    .toLowerCase();
  if (haystack.includes('dolar') || /\busd\b/.test(haystack)) {
    return 'USD';
  }
  return 'MXN';
}

/**
 * Días civiles transcurridos desde la fecha del saldo hasta hoy (TZ
 * America/Matamoros, donde operan las empresas de Beto). Hace visible un saldo
 * stale (como Finamex en Coda, sin actualizar desde noviembre).
 *
 * - null si no hay fecha (cuenta sin captura).
 * - 0 si el saldo es de hoy.
 * - Negativos se clampean a 0 (una fecha futura no es "antigüedad").
 *
 * Trabaja sobre el componente date-only para no shiftear por TZ: compara la
 * fecha calendar del saldo contra "hoy" en Matamoros.
 */
export function computeAntiguedadDias(
  fechaSaldo: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!fechaSaldo) return null;
  const isoDay = fechaSaldo.slice(0, 10);
  const parts = isoDay.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts as [number, number, number];

  // "Hoy" en hora de Matamoros, como componente calendar (sv-SE → YYYY-MM-DD).
  const hoyStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Matamoros' }).format(now);
  const [hy, hm, hd] = hoyStr.split('-').map(Number) as [number, number, number];

  // Compara en UTC para evitar shifts de DST entre las dos fechas calendar.
  const saldoUTC = Date.UTC(y, m - 1, d);
  const hoyUTC = Date.UTC(hy, hm - 1, hd);
  const dias = Math.floor((hoyUTC - saldoUTC) / 86_400_000);
  return Math.max(0, dias);
}
