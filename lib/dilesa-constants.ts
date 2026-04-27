/**
 * Constantes compartidas de los módulos Dilesa (sprint dilesa-1 UI).
 *
 * @deprecated DILESA_EMPRESA_ID se re-exporta desde `@/lib/empresa-constants`
 * — fuente única de verdad para los UUIDs de empresa (ADR-011 / convención
 * SM3). Los call sites pueden migrar a importar directamente de
 * `@/lib/empresa-constants` cuando convenga; este archivo mantiene los
 * helpers `formatM2`, `formatCurrency`, etc.
 */
export { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

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
