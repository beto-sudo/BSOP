'use client';

import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/module-page';
import { formatCurrency } from '@/lib/format';
import { estadoVariant } from './helpers';
import type { Corte } from './types';

const columns: Column<Corte>[] = [
  {
    key: 'caja_nombre',
    label: 'Caja',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-medium whitespace-nowrap',
  },
  {
    key: 'corte_nombre',
    label: 'Corte',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'text-sm text-muted-foreground whitespace-nowrap',
    render: (c) => c.corte_nombre || `Corte-${c.id.slice(0, 8)}`,
  },
  {
    key: 'hora_inicio',
    label: 'Inicio',
    type: 'datetime',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'text-sm whitespace-nowrap',
  },
  {
    key: 'hora_fin',
    label: 'Fin',
    type: 'datetime',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'text-sm whitespace-nowrap',
  },
  {
    key: 'pedidos_count',
    label: 'Pedidos',
    type: 'number',
    align: 'center',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'text-sm',
    render: (c) => c.pedidos_count ?? 0,
  },
  {
    key: 'estado',
    label: 'Estado',
    headerClassName: 'whitespace-nowrap',
    render: (c) => <Badge variant={estadoVariant(c.estado)}>{c.estado ?? '—'}</Badge>,
  },
  {
    key: 'ingresos_efectivo',
    label: 'Efectivo',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-medium',
  },
  {
    key: 'ingresos_tarjeta',
    label: 'Tarjeta',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-medium',
  },
  {
    key: 'ingresos_stripe',
    label: 'Stripe',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-medium',
  },
  {
    key: 'ingresos_transferencias',
    label: 'Transf.',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-medium',
  },
  {
    key: 'total_ingresos',
    label: 'Total',
    type: 'currency',
    headerClassName: 'whitespace-nowrap',
    cellClassName: 'font-semibold',
  },
  {
    key: 'efectivo_esperado',
    label: 'Ef. Esperado',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    render: (c) => ((c.efectivo_esperado ?? 0) !== 0 ? formatCurrency(c.efectivo_esperado) : '—'),
  },
  {
    key: 'movimientos',
    label: 'Movimientos',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    accessor: (c) => (c.depositos ?? 0) - (c.retiros ?? 0),
    render: (c) => {
      const neto = (c.depositos ?? 0) - (c.retiros ?? 0);
      if (neto === 0) return '—';
      const color = neto > 0 ? 'text-emerald-600' : 'text-destructive';
      return <span className={color}>{formatCurrency(neto)}</span>;
    },
  },
  {
    key: 'efectivo_contado',
    label: 'Ef. Contado',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    render: (c) => (c.efectivo_contado != null ? formatCurrency(c.efectivo_contado) : '—'),
  },
  {
    key: 'diferencia',
    label: 'Diferencia',
    type: 'currency',
    sortable: false,
    headerClassName: 'whitespace-nowrap',
    accessor: (c) =>
      c.efectivo_contado != null ? c.efectivo_contado - (c.efectivo_esperado ?? 0) : null,
    render: (c) => {
      const diff =
        c.efectivo_contado != null ? c.efectivo_contado - (c.efectivo_esperado ?? 0) : null;
      if (diff == null || diff === 0) return '—';
      const color = diff > 0 ? 'text-emerald-600' : 'text-destructive';
      return <span className={color}>{formatCurrency(diff)}</span>;
    },
  },
];

export function CortesTable({
  cortes,
  loading,
  onRowClick,
}: {
  cortes: Corte[];
  loading: boolean;
  onRowClick: (corte: Corte) => void;
}) {
  return (
    <DataTable<Corte>
      data={cortes}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRowClick={onRowClick}
      initialSort={{ key: 'hora_inicio', dir: 'desc' }}
      emptyTitle="Sin cortes en el rango seleccionado"
      emptyDescription="Ajusta las fechas o el preset para ver más cortes."
      showDensityToggle={false}
    />
  );
}
