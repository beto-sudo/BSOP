/**
 * Formatters compartidos del repo BSOP. Locale es-MX, TZ America/Matamoros.
 *
 * Punto de entrada: `import { formatCurrency, formatDate, ... } from '@/lib/format'`.
 *
 * Convenciones:
 * - Todos los formatters retornan `'—'` para null/undefined/NaN.
 * - Las fechas aceptan ISO completo (`2026-04-23T12:34:56Z`), ISO date-only
 *   (`2026-04-23`), o cualquier string parseable por `new Date()`.
 * - Si la fecha es inválida, se retorna el input crudo (lo que viene del
 *   backend) en vez de un placeholder — ayuda a debugging visual.
 *
 * Cuando un módulo necesita un formatter especializado (ej. delta de KPI con
 * coloreado), también vive aquí. NO crear formatters nuevos en `components/`
 * o `lib/<modulo>/` — todos viven en `lib/format/` y se re-exportan donde haga
 * falta por compat.
 */

export const TZ = 'America/Matamoros';
export const LOCALE = 'es-MX';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const DASH = '—';

function isNullish(v: unknown): boolean {
  return v == null || (typeof v === 'number' && Number.isNaN(v));
}

// ─── Currency ──────────────────────────────────────────────────────────────

export interface CurrencyOpts {
  /** Default 'MXN'. */
  currency?: string;
  /** Compact notation: $1.5M en lugar de $1,500,000. Default false. */
  compact?: boolean;
  /** Override decimal precision. Default: 2 si !compact, 1 si compact. */
  decimals?: number;
}

export function formatCurrency(value: number | null | undefined, opts: CurrencyOpts = {}): string {
  if (isNullish(value)) return DASH;
  const { currency = 'MXN', compact = false, decimals } = opts;
  const fractionDigits = decimals ?? (compact ? 1 : 2);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: compact ? 0 : fractionDigits,
  }).format(value as number);
}

// ─── Number ────────────────────────────────────────────────────────────────

export interface NumberOpts {
  /** Default 2. */
  decimals?: number;
}

export function formatNumber(value: number | null | undefined, opts: NumberOpts = {}): string {
  if (isNullish(value)) return DASH;
  const { decimals = 2 } = opts;
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value as number);
}

// ─── Percent ───────────────────────────────────────────────────────────────

export interface PercentOpts {
  /** Default 1. */
  fractionDigits?: number;
}

/**
 * Acepta valor en rango 0–1 (e.g. 0.275 → "27.5%"). Si tu valor está en 0–100,
 * dividí entre 100 antes de pasarlo.
 */
export function formatPercent(value: number | null | undefined, opts: PercentOpts = {}): string {
  if (isNullish(value)) return DASH;
  const { fractionDigits = 1 } = opts;
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value as number);
}

// ─── Dates ─────────────────────────────────────────────────────────────────

const MESES_ES_CORTO = [
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
];

function parseInput(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  // Date-only ISO: el caller espera la misma fecha local sin conversión TZ.
  if (DATE_ONLY_RE.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const cleaned = input.replace(' ', 'T');
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formato corto: "23 abr 2026".
 *
 * Para date-only ISO (`'2026-04-23'`), no se aplica TZ — se trata como
 * "fecha calendar" pura, sin shift. Esto evita bugs cross-TZ donde el
 * runner UTC interpreta el día como medianoche y formatear con TZ
 * Matamoros (UTC-5) lo regresa al día anterior.
 *
 * Para timestamps con hora, se usa TZ America/Matamoros.
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (input == null) return DASH;
  // Date-only: formato manual TZ-agnostic.
  if (typeof input === 'string' && DATE_ONLY_RE.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MESES_ES_CORTO[m - 1]} ${y}`;
  }
  const d = parseInput(input);
  if (!d) return typeof input === 'string' ? input : DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formato fecha + hora: "23/04/2026 14:30". TZ America/Matamoros.
 */
export function formatDateTime(input: string | Date | null | undefined): string {
  if (input == null) return DASH;
  const d = parseInput(input);
  if (!d) return typeof input === 'string' ? input : DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Solo hora: "14:30". TZ America/Matamoros.
 */
export function formatTime(input: string | Date | null | undefined): string {
  if (input == null) return DASH;
  const d = parseInput(input);
  if (!d) return typeof input === 'string' ? input : DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Días relativos al hoy (TZ America/Matamoros). Útil para columns tipo
 * "Vence en". Soporta past/future.
 *
 * - Hoy → "Hoy"
 * - Mañana / Ayer → "Mañana" / "Ayer"
 * - 2-30 días → "3d", "12d"
 * - 30-365 días → "2mes", "11mes"
 * - >365 días → "2año"
 */
export function formatRelativeDays(input: string | Date | null | undefined): string {
  if (input == null) return DASH;
  const d = parseInput(input);
  if (!d) return typeof input === 'string' ? input : DASH;
  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
  const targetStr = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
  const today = new Date(todayStr + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const abs = Math.abs(diffDays);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (abs < 30) return `${diffDays > 0 ? '' : '-'}${abs}d`;
  if (abs < 365) {
    const months = Math.round(abs / 30);
    return `${diffDays > 0 ? '' : '-'}${months}mes`;
  }
  const years = Math.round(abs / 365);
  return `${diffDays > 0 ? '' : '-'}${years}año`;
}

// ─── Delta ─────────────────────────────────────────────────────────────────

export interface DeltaResult {
  /** Texto formateado, e.g. "+1,234" o "-$50.00". */
  text: string;
  /** Signo: '+', '-' o '0'. */
  sign: '+' | '-' | '0';
  /** Tailwind class para color: 'text-emerald-600' / 'text-destructive' / 'text-muted-foreground'. */
  color: string;
}

export interface DeltaOpts {
  /** Si true, formatear como currency MXN. Default false. */
  currency?: boolean;
  /** Override decimales. */
  decimals?: number;
}

/**
 * Formatea un delta numérico para columnas de tabla (sales vs target, stock
 * vs minimo, etc.). Devuelve `{text, sign, color}` para que el caller decida
 * cómo aplicar el color.
 */
export function formatDelta(value: number | null | undefined, opts: DeltaOpts = {}): DeltaResult {
  const { currency = false, decimals } = opts;
  if (isNullish(value)) {
    return { text: DASH, sign: '0', color: 'text-muted-foreground' };
  }
  const v = value as number;
  const abs = Math.abs(v);
  const formatted = currency ? formatCurrency(abs, { decimals }) : formatNumber(abs, { decimals });
  if (v > 0) return { text: `+${formatted}`, sign: '+', color: 'text-emerald-600' };
  if (v < 0) return { text: `-${formatted}`, sign: '-', color: 'text-destructive' };
  return { text: formatted, sign: '0', color: 'text-muted-foreground' };
}

// ─── Real estate / dimensions ──────────────────────────────────────────────

/**
 * Superficie en m² o ha: "150 m²" / "1.5 ha". Cambia a hectáreas cuando
 * supera 10000 m² (1 ha).
 */
export function formatSuperficie(m2: number | null | undefined): string {
  if (isNullish(m2)) return DASH;
  const v = m2 as number;
  if (v >= 10000) {
    const ha = v / 10000;
    return `${ha.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} ha`;
  }
  return `${v.toLocaleString(LOCALE, { maximumFractionDigits: 0 })} m²`;
}

/**
 * Precio por m²: "$1,200/m²". Reduce a 2 decimales cuando precio < 10
 * para evitar perder precisión en valores pequeños.
 */
export function formatPrecioM2(
  precio: number | null | undefined,
  moneda: string | null = 'MXN'
): string {
  if (isNullish(precio)) return DASH;
  const v = precio as number;
  try {
    const formatted = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: moneda || 'MXN',
      maximumFractionDigits: v < 10 ? 2 : 0,
    }).format(v);
    return `${formatted}/m²`;
  } catch {
    return `${moneda ?? 'MXN'} ${v.toLocaleString(LOCALE)}/m²`;
  }
}

// ─── Bytes ─────────────────────────────────────────────────────────────────

/**
 * Tamaño de archivo: "512 B", "1.2 KB", "3.5 MB", "2.1 GB".
 */
export function formatBytes(b: number | null | undefined): string {
  if (isNullish(b) || b === 0) return '';
  const v = b as number;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
