import type { ReactNode } from 'react';

export type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'badge'
  | 'delta'
  | 'titleWithMeta'
  | 'custom';

export type ColumnAlign = 'left' | 'right' | 'center';

export interface TitleWithMeta {
  title: ReactNode;
  meta?: ReactNode;
}

/**
 * Declarative column definition. See ADR-010.
 *
 * - `key`: stable id; default sort key + cell accessor.
 * - `type`: semantic column type. Drives default styling (alignment,
 *   tabular-nums, color for delta, etc.). Default `'text'`.
 * - `render(row)`: optional override. For `type: 'custom'` is required;
 *   for built-in types it's an opt-in tweak.
 * - `accessor(row)`: when sort/value derivation needs more than `row[key]`
 *   (e.g. computed fields, nested objects).
 * - `showIf(rows)`: hide the entire column when the predicate is false.
 *   Useful for columns that only matter when some row has data.
 */
export interface Column<T> {
  key: string;
  label: string;
  type?: ColumnType;
  /** Default true. Use false for action columns or non-sortable customs. */
  sortable?: boolean;
  /** Override the property used to sort. Default: `key`. */
  sortKey?: keyof T;
  /** Tailwind width class: 'w-32' | 'min-w-[120px]' | 'flex-1', etc. */
  width?: string;
  /** Override the auto-inferred alignment from `type`. */
  align?: ColumnAlign;
  /** Sticky on horizontal scroll (use only for first column ideally). */
  sticky?: boolean;
  /** When false, the column is omitted entirely. */
  showIf?: (rows: T[]) => boolean;
  /** Cell renderer. Required for `type: 'custom'`. */
  render?: (row: T) => ReactNode;
  /** Sort/raw value extractor for non-trivial fields. */
  accessor?: (row: T) => unknown;
  /** Extra header className. */
  headerClassName?: string;
  /** Extra cell className applied to every cell in this column. */
  cellClassName?: string;
}

export type Density = 'compact' | 'comfortable';

export interface StickyConfig {
  header?: boolean;
  firstColumn?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Field used as React key for each row. Default `'id'`. */
  rowKey?: keyof T;
  /** Click handler for the row. Triggers a cursor-pointer + hover background. */
  onRowClick?: (row: T) => void;
  /** Sticky header / first column. Default `{ header: true }`. */
  sticky?: StickyConfig;
  /** Default `'comfortable'`. */
  density?: Density;
  /** Show density toggle in the toolbar. Default true. */
  showDensityToggle?: boolean;
  /** Called when user toggles density. Use this to persist via useUrlFilters. */
  onDensityChange?: (next: Density) => void;
  /** Initial sort. */
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Loading state. Renders TableSkeleton inside the wrapper. */
  loading?: boolean;
  /** Error state. Renders ErrorBanner above the table. */
  error?: Error | string | null;
  /** Retry handler for ErrorBanner. */
  onRetry?: () => void;
  /** Empty state copy. Defaults to "Sin resultados". */
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  /** Optional CTA inside EmptyState. */
  emptyAction?: ReactNode;
  /** Optional icon for the empty state. */
  emptyIcon?: ReactNode;
  /** Extra className for the wrapping <div>. */
  className?: string;
  /** Extra content rendered above the table (right of density toggle). */
  toolbar?: ReactNode;
}
