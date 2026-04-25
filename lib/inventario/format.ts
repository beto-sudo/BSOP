const CURRENCY_FORMATTER = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 2,
});

const DATE_SHORT_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Matamoros',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return CURRENCY_FORMATTER.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return NUMBER_FORMATTER.format(value);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return DATE_SHORT_FORMATTER.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return DATETIME_FORMATTER.format(new Date(iso));
}
