/**
 * @deprecated Use `@/lib/format` directly. This file re-exports for compat.
 *
 * Los formatters de inventario son idénticos a los de `lib/format/`. Mantén
 * este archivo para no romper imports existentes; los nuevos call sites
 * importan de `@/lib/format`.
 */
export {
  formatCurrency,
  formatNumber,
  formatDate as formatDateShort,
  formatDateTime,
} from '@/lib/format';
