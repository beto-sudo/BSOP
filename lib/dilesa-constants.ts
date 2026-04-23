/**
 * Constantes compartidas de los módulos Dilesa (sprint dilesa-1 UI).
 *
 * Cuando el app soporte multi-empresa activa, EMPRESA_ID se reemplaza por el
 * valor del context de permisos. Por ahora usamos el id fijo — mismo patrón
 * que `app/dilesa/admin/juntas/page.tsx` y el resto del panel.
 *
 * Fuente única para no repetir el literal en cada página.
 */
export const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/** Mexican peso currency formatter. Compact y siempre con 2 decimales. */
export function formatCurrency(value: number | null | undefined, opts?: { compact?: boolean }) {
  if (value == null || Number.isNaN(value)) return '—';
  const { compact = false } = opts ?? {};
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(value);
}

/** Format a numeric m² with thousands separators + suffix. */
export function formatM2(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 2,
  }).format(value)} m²`;
}

/** Percent formatter. Accepts 0–1 range, renders as xx.y%. */
export function formatPercent(value: number | null | undefined, fractionDigits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatDateShort(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}
