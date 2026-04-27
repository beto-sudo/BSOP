import { TZ } from './types';

/**
 * Re-exports de `@/lib/format` para compat con call sites de Cortes.
 *
 * @deprecated Use `formatCurrency` from `@/lib/format` directamente en código nuevo.
 */
export { formatCurrency } from '@/lib/format';

/**
 * Cortes maneja `formatDate` y `formatDateTime` con su propio formato (incluye
 * hora siempre, normalizado al estilo del marbete impreso). NO se reemplaza
 * por `lib/format/formatDate` que es date-only short. Mantener local.
 *
 * @deprecated En código nuevo, usar `formatDateTime` de `@/lib/format` (formato
 * locale-corto). Las dos viejas funciones de acá se mantienen porque su
 * formato custom es semánticamente parte del print stylesheet de Cortes.
 */
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

/** @deprecated Same as {@link formatDateTime}. Mantener para compat. */
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
