'use client';

import { Inbox } from 'lucide-react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { Badge } from '@/components/ui/badge';
import { EmptyState, TableSkeleton } from '@/components/module-page';
import type { Pedido } from './types';
import { formatCurrency, formatDate, statusVariant } from './utils';

type SortDir = 'asc' | 'desc';

export type VentasTableProps = {
  pedidos: Pedido[];
  loading: boolean;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  sortData: <T extends Record<string, unknown>>(data: T[]) => T[];
  onRowClick: (pedido: Pedido) => void;
};

export function VentasTable({
  pedidos,
  loading,
  sortKey,
  sortDir,
  onSort,
  sortData,
  onRowClick,
}: VentasTableProps) {
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              sortKey="order_id"
              label="Folio"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
            <SortableHead
              sortKey="timestamp"
              label="Fecha/Hora"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
            <SortableHead
              sortKey="place_name"
              label="Área"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
            <SortableHead
              sortKey="table_name"
              label="Mesa"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
            <SortableHead
              sortKey="total_amount"
              label="Total"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="text-right"
            />
            <SortableHead
              sortKey="status"
              label="Estado"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : pedidos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="p-0">
                <EmptyState
                  icon={<Inbox className="h-8 w-8" />}
                  title="Sin pedidos en el rango seleccionado"
                  description="Ajusta las fechas, el corte o los filtros activos para ver pedidos."
                />
              </TableCell>
            </TableRow>
          ) : (
            sortData(pedidos).map((pedido) => (
              <TableRow
                key={String(pedido.id)}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(pedido)}
              >
                <TableCell className="font-mono text-xs font-medium">
                  #{pedido.order_id ?? pedido.id}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(pedido.timestamp)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {pedido.layout_name || '-'}
                </TableCell>
                <TableCell className="text-sm font-medium">{pedido.table_name || '-'}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(pedido.total_amount)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(pedido.status)}>{pedido.status ?? '—'}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
