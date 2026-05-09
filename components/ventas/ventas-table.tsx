'use client';

import { Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Pedido } from './types';
import { statusVariant } from './utils';

const columns: Column<Pedido>[] = [
  {
    key: 'order_id',
    label: 'Folio',
    cellClassName: 'font-mono text-xs font-medium',
    render: (p) => (
      <span className="inline-flex items-center gap-2">
        <span>#{p.order_id ?? p.id}</span>
        {p.es_fantasma ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/10 px-1.5 py-0 text-[10px] font-normal uppercase tracking-wide text-amber-700 dark:text-amber-400"
            title={
              p.superseded_by_order_id
                ? `Detectado como duplicado del pedido #${p.superseded_by_order_id} (bug Waitry — ver ADR-031)`
                : 'Detectado como duplicado (bug Waitry)'
            }
          >
            Duplicado
          </Badge>
        ) : null}
      </span>
    ),
  },
  {
    key: 'timestamp',
    label: 'Fecha/Hora',
    cellClassName: 'text-sm text-muted-foreground',
    render: (p) => formatDate(p.timestamp),
  },
  {
    key: 'place_name',
    label: 'Área',
    cellClassName: 'text-sm text-muted-foreground',
    render: (p) => p.layout_name || '-',
    accessor: (p) => p.layout_name ?? '',
  },
  {
    key: 'table_name',
    label: 'Mesa',
    cellClassName: 'text-sm font-medium',
    render: (p) => p.table_name || '-',
  },
  {
    key: 'total_amount',
    label: 'Total',
    type: 'currency',
    cellClassName: 'font-medium',
    render: (p) => formatCurrency(p.total_amount),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (p) => <Badge variant={statusVariant(p.status)}>{p.status ?? '—'}</Badge>,
  },
];

export type VentasTableProps = {
  pedidos: Pedido[];
  loading: boolean;
  onRowClick: (pedido: Pedido) => void;
};

export function VentasTable({ pedidos, loading, onRowClick }: VentasTableProps) {
  return (
    <DataTable<Pedido>
      data={pedidos}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRowClick={onRowClick}
      initialSort={{ key: 'timestamp', dir: 'desc' }}
      emptyIcon={<Inbox className="h-8 w-8" />}
      emptyTitle="Sin pedidos en el rango seleccionado"
      emptyDescription="Ajusta las fechas, el corte o los filtros activos para ver pedidos."
      showDensityToggle={false}
    />
  );
}
