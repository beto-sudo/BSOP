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

/**
 * @deprecated Use `formatCurrency` from `@/lib/format`.
 * Re-exportado por compat con call sites de `dilesa-1 UI`.
 */
export { formatCurrency, formatPercent } from '@/lib/format';
export { formatDate as formatDateShort } from '@/lib/format';

import { formatNumber } from '@/lib/format';

/**
 * Format a numeric m² with thousands separators + suffix. NO se convierte a
 * hectáreas (a diferencia de `formatSuperficie` de `@/lib/format`). Útil
 * cuando el módulo siempre quiere unidades en m² independientemente del
 * tamaño.
 *
 * @deprecated Para superficies que pueden usar ha cuando son grandes,
 * preferir `formatSuperficie` de `@/lib/format`. Mantener éste solo cuando
 * se necesita forzar m² siempre.
 */
export function formatM2(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${formatNumber(value, { decimals: 2 })} m²`;
}
