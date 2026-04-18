import { TZ } from './types';

export function formatDateTime(ts: string | null | undefined) {
  if (!ts) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [yyyy, mm, dd] = ts.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  const cleanTs = ts.replace(' ', 'T');
  const d = new Date(cleanTs);

  if (isNaN(d.getTime())) return ts;

  return d
    .toLocaleString('es-MX', {
      timeZone: 'America/Matamoros',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', ' -');
}

export function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [yyyy, mm, dd] = ts.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }

  const cleanTs = ts.replace(' ', 'T');
  const d = new Date(cleanTs);

  if (isNaN(d.getTime())) return ts;

  return d.toLocaleString('es-MX', {
    timeZone: 'America/Matamoros',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export function todayRange() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

export function estadoVariant(
  estado: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (estado?.toLowerCase()) {
    case 'cerrado':
    case 'closed':
      return 'default';
    case 'abierto':
    case 'open':
      return 'secondary';
    default:
      return 'outline';
  }
}
