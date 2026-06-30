'use client';

import { useMemo, useState } from 'react';
import {
  DataTable,
  ModuleKpiStrip,
  ModuleFilters,
  ErrorBanner,
  type Column,
} from '@/components/module-page';
import { useUrlFilters } from '@/hooks/use-url-filters';
import type { ServiciosData, ReciboVista } from '@/lib/sanren-servicios';
import {
  computeServicioKpis,
  computeComparativos,
  computeAnomalias,
  type ServicioKpiSet,
  type Comparativos as ComparativosData,
} from '@/lib/sanren/servicios-analytics';
import { ServiciosTendencias } from '@/components/sanren/servicios-tendencias';
import { ReciboDrawer } from '@/components/sanren/recibo-drawer';

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

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`;
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
  tab: 'recibos',
  servicio: '',
  estadoPago: '',
  q: '',
  desde: '',
  hasta: '',
};

type Kpi = {
  key: string;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
};

const u = (s: string | null) => (s ? ` ${s}` : '');

/**
 * KPIs según el servicio activo. "Todos" mantiene el resumen genérico; cada
 * servicio muestra las métricas que cuentan su historia (Luz → solar/banco,
 * Agua/Gas → consumo y pico). Tope de 5 por ADR-004 R3.
 */
function buildKpis(servicio: string, k: ServicioKpiSet): Kpi[] {
  if (servicio === 'luz') {
    return [
      { key: 'gasto', label: 'Gasto', value: money(k.gasto) },
      { key: 'consumo', label: 'kWh consumidos', value: num(k.consumoTotal) },
      { key: 'gen', label: 'kWh generados', value: num(k.generacionTotal) },
      {
        key: 'banco',
        label: 'Banco de energía',
        value: k.bancoEnergia != null ? `${num(k.bancoEnergia)} kWh` : '—',
        valueClassName: k.bancoEnergia && k.bancoEnergia > 0 ? 'text-emerald-600' : undefined,
      },
      { key: 'costo', label: 'Costo/kWh', value: money(k.costoUnitarioProm) },
    ];
  }
  if (servicio === 'agua' || servicio === 'gas') {
    return [
      { key: 'gasto', label: 'Gasto', value: money(k.gasto) },
      { key: 'consumo', label: 'Consumo', value: num(k.consumoTotal, u(k.consumoUnidad)) },
      { key: 'costo', label: `Costo/${k.consumoUnidad ?? 'u'}`, value: money(k.costoUnitarioProm) },
      { key: 'prom', label: 'Consumo prom.', value: num(k.consumoPromMensual, u(k.consumoUnidad)) },
      {
        key: 'pico',
        label: 'Mes pico',
        value: k.mesPico ? fmtPeriodo(k.mesPico.periodo) : '—',
      },
    ];
  }
  // "Todos"
  return [
    { key: 'n', label: 'Recibos', value: k.count },
    { key: 'gasto', label: 'Gasto', value: money(k.gasto) },
    {
      key: 'pend',
      label: 'Pendientes de pago',
      value: k.pendientes,
      valueClassName: k.pendientes > 0 ? 'text-amber-500' : undefined,
    },
    {
      key: 'rango',
      label: 'Periodo',
      value: k.rango ? `${fmtPeriodo(k.rango[0])} – ${fmtPeriodo(k.rango[1])}` : '—',
    },
  ];
}

/** Color del delta: subir gasto es malo (ámbar/rojo), bajar es bueno (verde). */
function deltaCls(d: number | null): string {
  if (d == null) return 'text-[var(--text)]/50';
  return d > 0 ? 'text-amber-600' : 'text-emerald-600';
}

/**
 * Tarjeta de comparativos año-vs-año + alertas. Vive en la pestaña "Análisis".
 * Solo se muestra cuando hay historia suficiente para comparar.
 */
function Comparativos({ c, alertas }: { c: ComparativosData; alertas: number }) {
  const hayYoY = c.gastoMismoMesAnioPrevio != null;
  const hay12m = c.totalPrev12m > 0;
  if (!hayYoY && !hay12m && alertas === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {hayYoY ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text)]/55">
            {c.ultimoPeriodo ? fmtPeriodo(c.ultimoPeriodo) : '—'} vs. año previo
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${deltaCls(c.deltaGastoPct)}`}>
            {pct(c.deltaGastoPct)}
          </div>
          <div className="text-xs text-[var(--text)]/55">
            {money(c.gastoUltimo)} vs. {money(c.gastoMismoMesAnioPrevio)}
          </div>
        </div>
      ) : null}

      {hay12m ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--text)]/55">
            Últimos 12 meses
          </div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${deltaCls(c.delta12mPct)}`}>
            {pct(c.delta12mPct)}
          </div>
          <div className="text-xs text-[var(--text)]/55">
            {money(c.total12m)} vs. {money(c.totalPrev12m)} previos
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--text)]/55">
          Alertas de consumo
        </div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            alertas > 0 ? 'text-amber-500' : 'text-[var(--text)]/50'
          }`}
        >
          {alertas}
        </div>
        <div className="text-xs text-[var(--text)]/55">Recibos con consumo inusual</div>
      </div>
    </div>
  );
}

export function ServiciosView({ data }: { data: ServiciosData }) {
  const { recibos, servicios, empresaId, errors } = data;
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);
  const [drawer, setDrawer] = useState<{
    mode: 'nuevo' | 'detalle';
    recibo: ReciboVista | null;
  } | null>(null);

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

  const kpis = useMemo(
    () => buildKpis(filters.servicio, computeServicioKpis(filtered)),
    [filtered, filters.servicio]
  );

  const anomalias = useMemo(() => computeAnomalias(filtered), [filtered]);

  const comparativos = useMemo(() => computeComparativos(filtered), [filtered]);

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
      render: (r) => {
        const a = anomalias.get(r.id);
        return (
          <span className="inline-flex items-center justify-end gap-1">
            {a ? (
              <span
                title={`Consumo inusual: ${pct(a.exceso)} sobre el promedio reciente (${num(Math.round(a.baseline))})`}
                className="text-amber-500"
                aria-label="Consumo inusual"
              >
                ⚠
              </span>
            ) : null}
            {num(r.consumo_periodo, r.unidad_consumo ? ` ${r.unidad_consumo}` : '')}
          </span>
        );
      },
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

      {/* Lente por servicio: Todos · Luz · Agua · Gas (reemplaza el dropdown). */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-sm">
          {[
            { id: '', label: 'Todos' },
            ...tiposPresentes.map((t) => ({
              id: t,
              label: SERVICIO_STYLE[t]?.label ?? t,
            })),
          ].map((lente) => {
            const active = (filters.servicio || '') === lente.id;
            return (
              <button
                key={lente.id || 'todos'}
                onClick={() => setFilter('servicio', lente.id)}
                aria-pressed={active}
                className={`rounded-md px-3 py-1 transition ${
                  active
                    ? 'bg-[var(--text)]/10 font-medium text-[var(--text)]'
                    : 'text-[var(--text)]/60 hover:text-[var(--text)]'
                }`}
              >
                {lente.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setDrawer({ mode: 'nuevo', recibo: null })}
          className="rounded-lg bg-[var(--text)] px-3 py-1.5 text-sm font-medium text-[var(--bg)]"
        >
          + Nuevo recibo
        </button>
      </div>

      <ModuleKpiStrip cols={kpis.length === 5 ? 5 : 4} stats={kpis} />

      {/* Vista: tabla de recibos o análisis del servicio activo. */}
      <div className="flex w-fit gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 text-sm">
        {[
          { id: 'recibos', label: 'Recibos' },
          { id: 'analisis', label: 'Análisis' },
        ].map((t) => {
          const active = (filters.tab || 'recibos') === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setFilter('tab', t.id)}
              aria-pressed={active}
              className={`rounded-md px-3 py-1 transition ${
                active
                  ? 'bg-[var(--text)]/10 font-medium text-[var(--text)]'
                  : 'text-[var(--text)]/60 hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

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

      {(filters.tab || 'recibos') === 'analisis' ? (
        <div className="space-y-4">
          <Comparativos c={comparativos} alertas={anomalias.size} />
          <ServiciosTendencias recibos={filtered} />
        </div>
      ) : (
        <DataTable<ReciboVista>
          data={filtered}
          columns={columns}
          rowKey="id"
          initialSort={{ key: 'periodo', dir: 'desc' }}
          onRowClick={(r) => setDrawer({ mode: 'detalle', recibo: r })}
          emptyTitle="Ningún recibo coincide"
          emptyDescription="Ajusta los filtros."
        />
      )}

      <ReciboDrawer
        open={drawer !== null}
        onOpenChange={(o) => {
          if (!o) setDrawer(null);
        }}
        mode={drawer?.mode ?? 'nuevo'}
        recibo={drawer?.recibo ?? null}
        servicios={servicios}
        empresaId={empresaId}
      />
    </div>
  );
}
