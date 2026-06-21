'use client';

import { useMemo } from 'react';
import {
  DataTable,
  ModuleKpiStrip,
  ModuleFilters,
  ErrorBanner,
  type Column,
} from '@/components/module-page';
import { useUrlFilters } from '@/hooks/use-url-filters';
import type { ServiciosData, ReciboVista } from '@/lib/sanren-servicios';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtPeriodo(p: string): string {
  const [y, m] = p.split('-');
  const idx = Number(m) - 1;
  return `${MESES[idx] ?? m} ${y}`;
}

function money(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function num(n: number | null, suffix = ''): string {
  if (n == null) return '—';
  return `${n.toLocaleString('es-MX')}${suffix}`;
}

const SERVICIO_STYLE: Record<string, { label: string; cls: string }> = {
  luz: { label: 'Luz', cls: 'bg-amber-500/15 text-amber-600' },
  gas: { label: 'Gas', cls: 'bg-orange-500/15 text-orange-600' },
  agua: { label: 'Agua', cls: 'bg-sky-500/15 text-sky-600' },
};

function servicioBadge(tipo: string) {
  const s = SERVICIO_STYLE[tipo] ?? {
    label: tipo,
    cls: 'bg-[var(--text)]/10 text-[var(--text)]/70',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

const FILTER_DEFAULTS = {
  servicio: '',
  estadoPago: '',
  q: '',
  desde: '',
  hasta: '',
};

export function ServiciosView({ data }: { data: ServiciosData }) {
  const { recibos, errors } = data;
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);

  const tiposPresentes = useMemo(
    () => Array.from(new Set(recibos.map((r) => r.servicio_tipo))).sort(),
    [recibos]
  );

  const filtered = useMemo(() => {
    return recibos.filter((r) => {
      if (filters.servicio && r.servicio_tipo !== filters.servicio) return false;
      if (filters.estadoPago === 'pagado' && !r.pagado) return false;
      if (filters.estadoPago === 'pendiente' && r.pagado) return false;
      const mes = r.periodo.slice(0, 7);
      if (filters.desde && mes < filters.desde) return false;
      if (filters.hasta && mes > filters.hasta) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${r.folio ?? ''} ${r.proveedor ?? ''} ${r.servicio_tipo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recibos, filters]);

  const kpis = useMemo(() => {
    const n = filtered.length;
    const gasto = filtered.reduce((a, r) => a + (r.monto ?? 0), 0);
    const pendientes = filtered.filter((r) => !r.pagado).length;
    const meses = filtered.map((r) => r.periodo.slice(0, 7)).sort();
    const rango = meses.length
      ? `${fmtPeriodo(meses[0])} – ${fmtPeriodo(meses[meses.length - 1])}`
      : '—';
    return { n, gasto, pendientes, rango };
  }, [filtered]);

  const columns: Column<ReciboVista>[] = [
    {
      key: 'periodo',
      label: 'Periodo',
      cellClassName: 'font-medium whitespace-nowrap',
      render: (r) => fmtPeriodo(r.periodo),
    },
    {
      key: 'servicio_tipo',
      label: 'Servicio',
      render: (r) => servicioBadge(r.servicio_tipo),
    },
    { key: 'proveedor', label: 'Proveedor', render: (r) => r.proveedor ?? '—' },
    { key: 'folio', label: 'Folio', render: (r) => r.folio ?? '—' },
    {
      key: 'monto',
      label: 'Monto',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.monto ?? -1,
      render: (r) => <span className="font-semibold">{money(r.monto)}</span>,
    },
    {
      key: 'consumo_periodo',
      label: 'Consumo',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.consumo_periodo ?? -1,
      render: (r) => num(r.consumo_periodo, r.unidad_consumo ? ` ${r.unidad_consumo}` : ''),
    },
    {
      key: 'costo_unitario',
      label: 'Costo/u',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.costo_unitario ?? -1,
      render: (r) => money(r.costo_unitario),
    },
    {
      key: 'saldo_neto',
      label: 'Saldo neto',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.saldo_neto ?? 0,
      render: (r) =>
        r.tiene_produccion && r.saldo_neto != null ? (
          <span className={r.saldo_neto < 0 ? 'text-emerald-600' : ''}>{num(r.saldo_neto)}</span>
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        ),
    },
    {
      key: 'pagado',
      label: 'Pago',
      type: 'custom',
      accessor: (r) => (r.pagado ? 1 : 0),
      render: (r) =>
        r.pagado ? (
          <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600">
            Pagado
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600">
            Pendiente
          </span>
        ),
    },
    {
      key: 'recibo_adjunto_path',
      label: 'Archivos',
      sortable: false,
      render: (r) => (
        <span className="flex gap-2">
          {r.recibo_adjunto_path ? (
            <a
              href={r.recibo_adjunto_path}
              target="_blank"
              rel="noreferrer"
              title="Recibo (PDF)"
              className="hover:opacity-70"
            >
              📄
            </a>
          ) : null}
          {r.comprobante_adjunto_path ? (
            <a
              href={r.comprobante_adjunto_path}
              target="_blank"
              rel="noreferrer"
              title="Comprobante de pago"
              className="hover:opacity-70"
            >
              💳
            </a>
          ) : null}
          {!r.recibo_adjunto_path && !r.comprobante_adjunto_path ? (
            <span className="text-[var(--text)]/30">—</span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {errors.length > 0 ? <ErrorBanner error={errors.join(' · ')} /> : null}

      <ModuleKpiStrip
        cols={4}
        stats={[
          { key: 'n', label: 'Recibos', value: kpis.n },
          { key: 'gasto', label: 'Gasto', value: money(kpis.gasto) },
          {
            key: 'pend',
            label: 'Pendientes de pago',
            value: kpis.pendientes,
            valueClassName: kpis.pendientes > 0 ? 'text-amber-500' : undefined,
          },
          { key: 'rango', label: 'Periodo', value: kpis.rango },
        ]}
      />

      <ModuleFilters
        count={`${filtered.length} de ${recibos.length}`}
        actions={
          activeCount > 0 ? (
            <button
              onClick={clearAll}
              className="text-sm text-[var(--text)]/60 underline hover:text-[var(--text)]"
            >
              Limpiar filtros
            </button>
          ) : undefined
        }
      >
        <select
          value={filters.servicio}
          onChange={(e) => setFilter('servicio', e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
        >
          <option value="">Todos los servicios</option>
          {tiposPresentes.map((t) => (
            <option key={t} value={t}>
              {SERVICIO_STYLE[t]?.label ?? t}
            </option>
          ))}
        </select>

        <select
          value={filters.estadoPago}
          onChange={(e) => setFilter('estadoPago', e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
        >
          <option value="">Pagados y pendientes</option>
          <option value="pagado">Solo pagados</option>
          <option value="pendiente">Solo pendientes</option>
        </select>

        <input
          type="month"
          value={filters.desde}
          onChange={(e) => setFilter('desde', e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
          aria-label="Desde"
        />
        <input
          type="month"
          value={filters.hasta}
          onChange={(e) => setFilter('hasta', e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
          aria-label="Hasta"
        />

        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilter('q', e.target.value)}
          placeholder="Folio, proveedor…"
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm"
        />
      </ModuleFilters>

      <DataTable<ReciboVista>
        data={filtered}
        columns={columns}
        rowKey="id"
        initialSort={{ key: 'periodo', dir: 'desc' }}
        emptyTitle="Ningún recibo coincide"
        emptyDescription="Ajusta los filtros."
      />
    </div>
  );
}
