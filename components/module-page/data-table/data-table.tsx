'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '../empty-state';
import { ErrorBanner } from '../error-banner';
import { TableSkeleton } from '../table-skeleton';
import { DensityToggle } from './density-toggle';
import { resolveAlign, renderCell, typeClassName, getSortValue } from './column-helpers';
import type { Column, DataTableProps, Density } from './types';

const ALIGN_CLASS: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const DENSITY_CELL: Record<Density, string> = {
  compact: 'py-1 text-sm',
  comfortable: 'py-2',
};

/**
 * `<DataTable>` — tabla declarativa compartida del repo. Ver ADR-010.
 *
 * Wrappea `@tanstack/react-table` (core) con la API simplificada que usa
 * BSOP: column types semánticos, density toggle, sticky, integración con
 * los 3 estados de ADR-006 (loading/error/empty), print stylesheet.
 *
 * Para celdas con popover/inline-edit, usar `<DataTable.InteractiveCell>`
 * para cancelar el `onRowClick` ahí (DT5).
 */
export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  rowKey = 'id' as keyof T,
  onRowClick,
  sticky = { header: true },
  density = 'comfortable',
  showDensityToggle = true,
  onDensityChange,
  initialSort,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  emptyAction,
  emptyIcon,
  className,
  toolbar,
}: DataTableProps<T>) {
  // Filtrar columnas con `showIf` falso (DT2 del ADR).
  const visibleColumns = useMemo(
    () => columns.filter((c) => !c.showIf || c.showIf(data)),
    [columns, data]
  );

  // Map a tanstack ColumnDef.
  const tanstackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      visibleColumns.map((col) => ({
        id: col.key,
        header: col.label,
        accessorFn: (row: T) => getSortValue(col, row),
        enableSorting: col.sortable !== false,
        cell: (ctx) => renderCell(col, ctx.row.original),
      })),
    [visibleColumns]
  );

  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.key, desc: initialSort.dir === 'desc' }] : []
  );

  const table = useReactTable<T>({
    data,
    columns: tanstackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {error ? <ErrorBanner error={error} onRetry={onRetry} /> : null}

      {(showDensityToggle && onDensityChange) || toolbar ? (
        <div className="flex items-center justify-end gap-2 print:hidden">
          {toolbar}
          {showDensityToggle && onDensityChange ? (
            <DensityToggle density={density} onChange={onDensityChange} />
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          'rounded-xl border bg-card',
          sticky.header && 'overflow-auto',
          'print:overflow-visible print:rounded-none print:border-0'
        )}
      >
        <Table>
          <TableHeader
            className={cn(
              sticky.header &&
                'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)] print:static print:shadow-none'
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, idx) => {
                  const col = visibleColumns[idx];
                  if (!col) return null;
                  const align = resolveAlign(col);
                  const isSticky = col.sticky && idx === 0;
                  const sortDir = header.column.getIsSorted();
                  const SortIcon =
                    sortDir === 'asc'
                      ? ChevronUp
                      : sortDir === 'desc'
                        ? ChevronDown
                        : ChevronsUpDown;
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sortDir === 'asc'
                          ? 'ascending'
                          : sortDir === 'desc'
                            ? 'descending'
                            : header.column.getCanSort()
                              ? 'none'
                              : undefined
                      }
                      className={cn(
                        ALIGN_CLASS[align],
                        col.width,
                        isSticky && 'sticky left-0 z-[5] bg-card print:static',
                        col.headerClassName
                      )}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1.5 font-medium hover:text-foreground',
                            sortDir ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon
                            className={cn(
                              'size-3.5 shrink-0 transition-opacity',
                              sortDir ? 'opacity-100' : 'opacity-50'
                            )}
                            aria-hidden
                          />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton rows={data.length || 8} columns={visibleColumns.length} />
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="p-0">
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={String(row.original[rowKey] ?? row.id)}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                  onClick={
                    onRowClick
                      ? (e: MouseEvent) => {
                          // Honor DataTable.InteractiveCell stopPropagation.
                          if (e.defaultPrevented) return;
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const col = visibleColumns[idx];
                    if (!col) return null;
                    const align = resolveAlign(col);
                    const isSticky = col.sticky && idx === 0;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          ALIGN_CLASS[align],
                          typeClassName(col),
                          DENSITY_CELL[density],
                          isSticky &&
                            'sticky left-0 z-[1] bg-card group-hover:bg-muted/50 print:static',
                          col.cellClassName
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Re-export `InteractiveCell` as `DataTable.InteractiveCell` for ergonomic
// access at call sites. See DT5 of ADR-010.
import { InteractiveCell } from './interactive-cell';
DataTable.InteractiveCell = InteractiveCell;

export type { Column };
