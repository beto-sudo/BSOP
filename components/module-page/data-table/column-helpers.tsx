import type { ReactNode } from 'react';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDelta,
  formatNumber,
} from '@/lib/format';
import type { Column, ColumnAlign, ColumnType, TitleWithMeta } from './types';

const ALIGN_BY_TYPE: Partial<Record<ColumnType, ColumnAlign>> = {
  number: 'right',
  currency: 'right',
  delta: 'right',
};

/**
 * Resuelve el align de una columna: explícito si se pasó, inferido por type
 * (number/currency/delta → right), default 'left'.
 */
export function resolveAlign<T>(col: Column<T>): ColumnAlign {
  if (col.align) return col.align;
  return ALIGN_BY_TYPE[col.type ?? 'text'] ?? 'left';
}

/**
 * Tailwind classes que aplica un column type a sus celdas (por encima del
 * align).
 */
export function typeClassName<T>(col: Column<T>): string {
  const t = col.type ?? 'text';
  if (t === 'number' || t === 'currency' || t === 'delta') {
    return 'tabular-nums whitespace-nowrap';
  }
  return '';
}

/**
 * Devuelve el valor crudo para sort. Si `accessor` está, lo usa; si no,
 * `row[sortKey ?? key]`.
 */
export function getSortValue<T>(col: Column<T>, row: T): unknown {
  if (col.accessor) return col.accessor(row);
  const key = (col.sortKey ?? col.key) as keyof T;
  return row[key];
}

function getRawValue<T>(col: Column<T>, row: T): unknown {
  if (col.accessor) return col.accessor(row);
  return (row as Record<string, unknown>)[col.key];
}

/**
 * Render del contenido de una celda según el column type. El caller envuelve
 * en `<TableCell>` y aplica clases de align/type.
 */
export function renderCell<T>(col: Column<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  const raw = getRawValue(col, row);
  const t = col.type ?? 'text';
  switch (t) {
    case 'currency':
      return formatCurrency(raw as number | null | undefined);
    case 'number':
      return formatNumber(raw as number | null | undefined);
    case 'date':
      return formatDate(raw as string | Date | null | undefined);
    case 'datetime':
      return formatDateTime(raw as string | Date | null | undefined);
    case 'delta': {
      const d = formatDelta(raw as number | null | undefined);
      return <span className={d.color}>{d.text}</span>;
    }
    case 'titleWithMeta': {
      const v = raw as TitleWithMeta | null | undefined;
      if (!v) return '—';
      return (
        <div className="flex flex-col">
          <span className="font-medium">{v.title}</span>
          {v.meta ? <span className="text-xs text-muted-foreground">{v.meta}</span> : null}
        </div>
      );
    }
    case 'badge':
    case 'custom':
      // Sin render explícito, fallback a string casted.
      return raw == null ? '—' : String(raw);
    default:
      // 'text'
      return raw == null || raw === '' ? '—' : String(raw);
  }
}
