'use client';
import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export interface TableSkeletonProps {
  /** How many skeleton rows to render. */
  rows?: number;
  /** Either a column count (uniform widths) or per-column Tailwind width classes. */
  columns: number | string[];
}

/**
 * Loading skeleton for module tables. Renders inside `<TableBody>`. See ADR-006.
 *
 * - `columns={5}` → 5 cells per row, all `w-full`.
 * - `columns={['w-32','w-full','w-20','w-16','w-12']}` → per-column widths to
 *   reflect the real shape of the table (left-anchored labels, narrow numerics).
 */
export function TableSkeleton({ rows = 5, columns }: TableSkeletonProps) {
  const widths =
    typeof columns === 'number' ? Array.from({ length: columns }, () => 'w-full') : columns;
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <TableRow key={rowIdx} role="status" aria-label="Cargando">
          {widths.map((w, colIdx) => (
            <TableCell key={colIdx}>
              <Skeleton className={['h-4', w].join(' ')} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
