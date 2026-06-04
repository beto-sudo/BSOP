/**
 * Helpers puros para el tab "Comparativo" de Ventas RDB.
 *
 * Todo el bucketing por semana ISO (lunes–domingo) vive acá, separado del
 * componente, para poder testearlo sin DOM ni red. Las fechas se manejan como
 * strings calendario `YYYY-MM-DD` en la TZ del club (misma `TZ` que el resto
 * del módulo de Ventas) y la aritmética de días se hace anclada a mediodía UTC
 * para evitar drift por offset/DST.
 */

import { TZ } from './utils';

export type SemanaBucket = {
  /** Lunes de la semana, `YYYY-MM-DD` en TZ del club. */
  inicio: string;
  /** Domingo de la semana, `YYYY-MM-DD`. */
  fin: string;
  /** Número de semana ISO 8601 (1–53). */
  isoSemana: number;
  /** `true` para la semana en curso (la última de la ventana, parcial). */
  enCurso: boolean;
};

const MS_DIA = 86_400_000;

const MESES_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** Fecha calendario `YYYY-MM-DD` de `now` en la TZ dada. */
export function hoyEnTz(now: Date, tz: string = TZ): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(now);
}

/**
 * Fecha calendario `YYYY-MM-DD` de un timestamp (timestamptz del backend) en
 * la TZ del club. Se usa para ubicar cada pedido en su día local — un pedido a
 * las 23:00 UTC cae en el día anterior en Matamoros (UTC-5).
 */
export function fechaEnTz(ts: string | Date, tz: string = TZ): string {
  const d = typeof ts === 'string' ? new Date(ts.replace(' ', 'T')) : ts;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(d);
}

/** Parsea `YYYY-MM-DD` a un Date anclado a mediodía UTC (sin shift de día). */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lunes ISO de la semana que contiene `ymd`. */
export function lunesDe(ymd: string): string {
  const d = parseYmd(ymd);
  const dow = (d.getUTCDay() + 6) % 7; // Lun=0 … Dom=6
  d.setUTCDate(d.getUTCDate() - dow);
  return toYmd(d);
}

/** Número de semana ISO 8601 para `ymd`. */
export function isoSemana(ymd: string): number {
  const d = parseYmd(ymd);
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jueves de esta semana
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const primerDayNum = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - primerDayNum + 3);
  return 1 + Math.round((d.getTime() - primerJueves.getTime()) / (7 * MS_DIA));
}

/**
 * Las últimas `n` semanas ISO terminando en la semana en curso (parcial),
 * más vieja primero. `now` se inyecta para poder testear de forma determinista.
 */
export function ventanaSemanas(now: Date, n = 6, tz: string = TZ): SemanaBucket[] {
  const lunesActual = lunesDe(hoyEnTz(now, tz));
  const base = parseYmd(lunesActual);
  const out: SemanaBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const lunes = new Date(base);
    lunes.setUTCDate(lunes.getUTCDate() - i * 7);
    const domingo = new Date(lunes);
    domingo.setUTCDate(domingo.getUTCDate() + 6);
    const inicio = toYmd(lunes);
    out.push({ inicio, fin: toYmd(domingo), isoSemana: isoSemana(inicio), enCurso: i === 0 });
  }
  return out;
}

/** Índice (0…n-1) del bucket en que cae `fecha`, o -1 si queda fuera. */
export function indiceSemana(fecha: string, semanas: readonly SemanaBucket[]): number {
  for (let i = 0; i < semanas.length; i++) {
    const s = semanas[i];
    if (fecha >= s.inicio && fecha <= s.fin) return i;
  }
  return -1;
}

/** Primer día `YYYY-MM-DD` del mes calendario que contiene `ymd`. */
export function inicioMes(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Etiqueta de mes corta: `2026-05-11` → "may 2026". */
export function etiquetaMes(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return `${MESES_ES[m - 1]} ${y}`;
}

/** Etiqueta día+mes corta: `2026-05-11` → "11 may". */
export function etiquetaCorta(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MESES_ES[m - 1]}`;
}
