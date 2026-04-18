export const TZ = 'America/Matamoros';

export const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
export const MXN_FULL = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export const DAY_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
});
export const DATE_TIME_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
});
export const DATE_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});
export const PENDING_DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
export const PENDING_TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const WEEK_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
});
export const MONTH_FMT = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  month: 'short',
  year: '2-digit',
});
export const WEEKDAY_KEY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
});
export const HOUR_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: '2-digit',
  hour12: false,
});

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const WEEKDAY_INDEX_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
