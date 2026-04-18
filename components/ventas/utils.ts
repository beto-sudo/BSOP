export const TZ = 'America/Matamoros';

export function formatDate(ts: string | null) {
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

export function todayRange(): { from: string; to: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
  const today = formatter.format(now);
  return { from: today, to: today };
}

export function statusVariant(
  status: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'completado':
    case 'paid':
    case 'pagado':
      return 'default';
    case 'cancelled':
    case 'cancelado':
      return 'destructive';
    case 'pending':
    case 'pendiente':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Resolve a named preset (hoy / ayer / semana / 7dias / mes / 30dias / ano) into
 * a concrete `{from, to}` date range in `TZ`. Returns `null` for unknown keys.
 */
export function rangeForPreset(preset: string): { from: string; to: string } | null {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });

  if (preset === 'hoy') {
    const t = formatter.format(today);
    return { from: t, to: t };
  }
  if (preset === 'ayer') {
    const ayer = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    ayer.setDate(ayer.getDate() - 1);
    const t = formatter.format(ayer);
    return { from: t, to: t };
  }
  if (preset === 'semana') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return { from: formatter.format(monday), to: formatter.format(today) };
  }
  if (preset === '7dias') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 7);
    return { from: formatter.format(d), to: formatter.format(today) };
  }
  if (preset === 'mes') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: formatter.format(first), to: formatter.format(today) };
  }
  if (preset === '30dias') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    d.setDate(d.getDate() - 30);
    return { from: formatter.format(d), to: formatter.format(today) };
  }
  if (preset === 'ano') {
    const d = new Date(today.toLocaleString('en-US', { timeZone: TZ }));
    const first = new Date(d.getFullYear(), 0, 1);
    return { from: formatter.format(first), to: formatter.format(today) };
  }
  return null;
}
