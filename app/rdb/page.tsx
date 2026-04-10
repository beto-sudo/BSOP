'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { AlertTriangle, CalendarRange, Loader2, Receipt, Scissors, ShoppingBag, TrendingUp } from 'lucide-react';

type RangeKey = 'month' | '7d' | '30d' | 'year';

type PedidoLite = {
  order_id: string | null;
  timestamp: string | null;
  total_amount: number | null;
  status: string | null;
  corte_id?: string | null;
};

type CorteLite = {
  id: string;
  corte_nombre: string | null;
  caja_nombre: string | null;
  fecha_operativa: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: string | null;
  efectivo_contado?: number | null;
  efectivo_esperado?: number | null;
  total_ingresos?: number | null;
  pedidos_count?: number | null;
};

type AttentionAlert = {
  title: string;
  detail: string;
  tone: 'critical' | 'warning' | 'info';
};

type ChartPoint = {
  label: string;
  day: number;
  current: number | null;
  previous: number | null;
  lastYear: number | null;
};

type Insight = {
  label: string;
  value: string;
};

const TZ = 'America/Matamoros';
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const MXN_FULL = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DAY_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, month: 'long', year: 'numeric' });

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return MXN_FULL.format(value);
}

function isoDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nowInTz() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function normalizeStatus(status: string | null | undefined) {
  return (status ?? '').toLowerCase();
}

function isCancelled(status: string | null | undefined) {
  const value = normalizeStatus(status);
  return value.includes('cancel');
}

function sumSales(rows: PedidoLite[]) {
  return rows.reduce((acc, row) => acc + (row.total_amount ?? 0), 0);
}

function safeCount(rows: PedidoLite[]) {
  return rows.filter((row) => !isCancelled(row.status)).length;
}

function getRangeMeta(range: RangeKey) {
  const now = nowInTz();

  if (range === '7d') {
    const from = addDays(now, -6);
    return {
      rangeLabel: 'Últimos 7 días',
      from,
      to: now,
      compareMode: 'none' as const,
    };
  }

  if (range === '30d') {
    const from = addDays(now, -29);
    return {
      rangeLabel: 'Últimos 30 días',
      from,
      to: now,
      compareMode: 'none' as const,
    };
  }

  if (range === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return {
      rangeLabel: 'Año en curso',
      from,
      to: now,
      compareMode: 'none' as const,
    };
  }

  const from = startOfMonth(now);
  return {
    rangeLabel: MONTH_FMT.format(from).replace(/^./, (c) => c.toUpperCase()),
    from,
    to: now,
    compareMode: 'month' as const,
    previousFrom: startOfMonth(addMonths(now, -1)),
    previousTo: endOfMonth(addMonths(now, -1)),
    lastYearFrom: new Date(now.getFullYear() - 1, now.getMonth(), 1),
    lastYearTo: new Date(now.getFullYear() - 1, now.getMonth() + 1, 0),
  };
}

function aggregateMonthByDay(rows: PedidoLite[], referenceDate: Date) {
  const map = new Map<number, number>();
  rows.filter((row) => !isCancelled(row.status)).forEach((row) => {
    if (!row.timestamp) return;
    const date = new Date(row.timestamp.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return;
    const day = date.getDate();
    map.set(day, (map.get(day) ?? 0) + (row.total_amount ?? 0));
  });

  const daysInMonth = endOfMonth(referenceDate).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      day,
      label: DAY_FMT.format(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), day)),
      value: map.get(day) ?? 0,
    };
  });
}

function aggregateRangeByDay(rows: PedidoLite[], from: Date, to: Date): ChartPoint[] {
  const map = new Map<string, number>();
  rows.filter((row) => !isCancelled(row.status)).forEach((row) => {
    if (!row.timestamp) return;
    const date = new Date(row.timestamp.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return;
    const key = isoDateLocal(date);
    map.set(key, (map.get(key) ?? 0) + (row.total_amount ?? 0));
  });

  const points: ChartPoint[] = [];
  let cursor = new Date(from);
  let index = 1;
  while (cursor <= to) {
    const key = isoDateLocal(cursor);
    points.push({
      label: DAY_FMT.format(cursor),
      day: index,
      current: map.get(key) ?? 0,
      previous: null,
      lastYear: null,
    });
    cursor = addDays(cursor, 1);
    index += 1;
  }
  return points;
}

function buildMonthComparisonChart(currentRows: PedidoLite[], previousRows: PedidoLite[], lastYearRows: PedidoLite[], referenceDate: Date): ChartPoint[] {
  const current = aggregateMonthByDay(currentRows, referenceDate);
  const previous = aggregateMonthByDay(previousRows, addMonths(referenceDate, -1));
  const lastYear = aggregateMonthByDay(lastYearRows, new Date(referenceDate.getFullYear() - 1, referenceDate.getMonth(), 1));

  return current.map((point, index) => ({
    label: point.label,
    day: point.day,
    current: point.value,
    previous: previous[index]?.value ?? null,
    lastYear: lastYear[index]?.value ?? null,
  }));
}

function buildSeriesPath(values: Array<number | null>, width: number, height: number, maxValue: number) {
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const safeValue = value ?? 0;
    const y = height - (safeValue / (maxValue || 1)) * height;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return points.join(' ');
}

function pctChange(current: number, baseline: number) {
  if (!baseline) return null;
  return ((current - baseline) / baseline) * 100;
}

function buildInsights(rows: PedidoLite[], chart: ChartPoint[], rangeLabel: string): Insight[] {
  const cleanRows = rows.filter((row) => !isCancelled(row.status));
  if (!cleanRows.length) return [];

  const bestDay = [...chart]
    .filter((point) => (point.current ?? 0) > 0)
    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0))[0];
  const total = sumSales(cleanRows);
  const avgTicket = total / cleanRows.length;
  const activeDays = chart.filter((point) => (point.current ?? 0) > 0).length;
  const avgDaily = activeDays ? total / activeDays : total;

  return [
    bestDay
      ? { label: 'Mejor día', value: `${bestDay.label}: ${MXN.format(bestDay.current ?? 0)}` }
      : null,
    { label: 'Ticket promedio', value: MXN_FULL.format(avgTicket) },
    { label: `Promedio diario en ${rangeLabel.toLowerCase()}`, value: MXN.format(avgDaily) },
  ].filter(Boolean) as Insight[];
}

function AttentionCard({ alert }: { alert: AttentionAlert }) {
  const tones = {
    critical: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  } as const;

  return (
    <div className={`rounded-2xl border p-4 ${tones[alert.tone]}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">{alert.title}</div>
          <div className="mt-1 text-sm opacity-90">{alert.detail}</div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/50">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-sm text-[var(--text)]/55">{hint}</div> : null}
    </div>
  );
}

function SalesChart({ data, showComparisons }: { data: ChartPoint[]; showComparisons: boolean }) {
  const width = 760;
  const height = 240;
  const values = data.flatMap((point) => [point.current ?? 0, showComparisons ? point.previous ?? 0 : 0, showComparisons ? point.lastYear ?? 0 : 0]);
  const maxValue = Math.max(...values, 1);
  const currentPath = buildSeriesPath(data.map((point) => point.current), width, height, maxValue);
  const previousPath = buildSeriesPath(data.map((point) => point.previous), width, height, maxValue);
  const lastYearPath = buildSeriesPath(data.map((point) => point.lastYear), width, height, maxValue);

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-[var(--text)]/65"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Periodo actual</div>
        {showComparisons ? <div className="flex items-center gap-2 text-sm text-[var(--text)]/65"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Mes anterior</div> : null}
        {showComparisons ? <div className="flex items-center gap-2 text-sm text-[var(--text)]/65"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Mismo mes año anterior</div> : null}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height + 28}`} className="min-w-[720px]">
          {[0.25, 0.5, 0.75, 1].map((tick) => {
            const y = height - tick * height;
            return <line key={tick} x1="0" x2={width} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
          })}
          {showComparisons ? <path d={previousPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" /> : null}
          {showComparisons ? <path d={lastYearPath} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="3 5" /> : null}
          <path d={currentPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {data.filter((point) => point.day === 1 || point.day % 5 === 0 || point.day === data.length).map((point) => {
            const x = data.length === 1 ? width / 2 : ((point.day - 1) / (data.length - 1)) * width;
            return (
              <text key={point.day} x={x} y={height + 20} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.45">
                {point.day}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function RdbHomePage() {
  const [range, setRange] = useState<RangeKey>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentRows, setCurrentRows] = useState<PedidoLite[]>([]);
  const [previousRows, setPreviousRows] = useState<PedidoLite[]>([]);
  const [lastYearRows, setLastYearRows] = useState<PedidoLite[]>([]);
  const [cortes, setCortes] = useState<CorteLite[]>([]);

  const fetchHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const meta = getRangeMeta(range);

      const ordersCurrent = supabase
        .schema('rdb')
        .from('waitry_pedidos')
        .select('order_id,timestamp,total_amount,status,corte_id')
        .gte('timestamp', `${isoDateLocal(meta.from)}T00:00:00-06:00`)
        .lte('timestamp', `${isoDateLocal(meta.to)}T23:59:59-06:00`)
        .order('timestamp', { ascending: true })
        .limit(range === 'year' ? 12000 : 6000);

      const cortesQuery = supabase.schema('rdb').from('v_cortes_lista').select('id,corte_nombre,caja_nombre,fecha_operativa,hora_inicio,hora_fin,estado,efectivo_contado,efectivo_esperado,total_ingresos,pedidos_count').order('fecha_operativa', { ascending: false }).order('hora_inicio', { ascending: false }).limit(40);

      const previousQuery =
        meta.compareMode === 'month'
          ? supabase
              .schema('rdb')
              .from('waitry_pedidos')
              .select('order_id,timestamp,total_amount,status,corte_id')
              .gte('timestamp', `${isoDateLocal(meta.previousFrom)}T00:00:00-06:00`)
              .lte('timestamp', `${isoDateLocal(meta.previousTo)}T23:59:59-06:00`)
              .order('timestamp', { ascending: true })
              .limit(6000)
          : Promise.resolve({ data: [], error: null });

      const lastYearQuery =
        meta.compareMode === 'month'
          ? supabase
              .schema('rdb')
              .from('waitry_pedidos')
              .select('order_id,timestamp,total_amount,status,corte_id')
              .gte('timestamp', `${isoDateLocal(meta.lastYearFrom)}T00:00:00-06:00`)
              .lte('timestamp', `${isoDateLocal(meta.lastYearTo)}T23:59:59-06:00`)
              .order('timestamp', { ascending: true })
              .limit(6000)
          : Promise.resolve({ data: [], error: null });

      const [currentRes, cortesRes, previousRes, lastYearRes] = await Promise.all([
        ordersCurrent,
        cortesQuery,
        previousQuery,
        lastYearQuery,
      ]);
      if (currentRes.error) throw currentRes.error;
      if (cortesRes.error) throw cortesRes.error;
      if (previousRes?.error) throw previousRes.error;
      if (lastYearRes?.error) throw lastYearRes.error;

      setCurrentRows((currentRes.data ?? []) as PedidoLite[]);
      setCortes((cortesRes.data ?? []) as CorteLite[]);
      setPreviousRows(((previousRes?.data ?? []) as PedidoLite[]) || []);
      setLastYearRows(((lastYearRes?.data ?? []) as PedidoLite[]) || []);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar la home de RDB');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void fetchHome();
  }, [fetchHome]);

  const meta = useMemo(() => getRangeMeta(range), [range]);
  const cleanRows = useMemo(() => currentRows.filter((row) => !isCancelled(row.status)), [currentRows]);
  const sales = useMemo(() => sumSales(cleanRows), [cleanRows]);
  const orders = cleanRows.length;
  const avgTicket = orders ? sales / orders : 0;
  const openCorte = useMemo(() => cortes.find((corte) => normalizeStatus(corte.estado) === 'abierto'), [cortes]);
  const latestCorte = cortes[0] ?? null;
  const chartData = useMemo(
    () =>
      range === 'month'
        ? buildMonthComparisonChart(cleanRows, previousRows, lastYearRows, meta.from)
        : aggregateRangeByDay(cleanRows, meta.from, meta.to),
    [cleanRows, previousRows, lastYearRows, meta.from, meta.to, range],
  );
  const insights = useMemo(() => buildInsights(cleanRows, chartData, meta.rangeLabel), [cleanRows, chartData, meta.rangeLabel]);

  const attention = useMemo<AttentionAlert[]>(() => {
    const alerts: AttentionAlert[] = [];
    const abiertos = cortes.filter((corte) => normalizeStatus(corte.estado) === 'abierto');
    if (abiertos.length) {
      const open = abiertos[0];
      alerts.push({
        title: `Hay ${abiertos.length} corte${abiertos.length > 1 ? 's' : ''} abierto${abiertos.length > 1 ? 's' : ''}`,
        detail: `${open.corte_nombre ?? 'Corte actual'}${open.caja_nombre ? ` · ${open.caja_nombre}` : ''} sigue en operación.`,
        tone: 'warning',
      });
    }

    const desfasados = cortes.filter((corte) => {
      if (normalizeStatus(corte.estado) !== 'cerrado') return false;
      const diff = Math.abs((corte.efectivo_contado ?? 0) - (corte.efectivo_esperado ?? 0));
      return diff >= 150;
    })[0];
    if (desfasados) {
      const diff = Math.abs((desfasados.efectivo_contado ?? 0) - (desfasados.efectivo_esperado ?? 0));
      alerts.push({
        title: 'Diferencia relevante en corte reciente',
        detail: `${desfasados.corte_nombre ?? 'Corte'} presenta una diferencia de ${MXN_FULL.format(diff)} entre esperado y contado.`,
        tone: 'critical',
      });
    }

    const sinPedidos = cortes.find((corte) => normalizeStatus(corte.estado) === 'cerrado' && (corte.total_ingresos ?? 0) > 0 && (corte.pedidos_count ?? 0) === 0);
    if (sinPedidos) {
      alerts.push({
        title: 'Corte con ingresos sin pedidos asociados',
        detail: `${sinPedidos.corte_nombre ?? 'Corte'} tiene totales cargados, pero el conteo de pedidos aparece en cero.`,
        tone: 'info',
      });
    }

    return alerts.slice(0, 3);
  }, [cortes]);

  const previousTotal = useMemo(() => sumSales(previousRows.filter((row) => !isCancelled(row.status))), [previousRows]);
  const lastYearTotal = useMemo(() => sumSales(lastYearRows.filter((row) => !isCancelled(row.status))), [lastYearRows]);
  const vsPrev = pctChange(sales, previousTotal);
  const vsLastYear = pctChange(sales, lastYearTotal);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">Rincón del Bosque</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">Home operativa</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text)]/60">Lectura rápida del negocio, enfocada en ventas del periodo y estado de cortes, sin duplicar accesos del menú.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]/65">
            <CalendarRange className="h-4 w-4" />
            {meta.rangeLabel}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center gap-3 text-[var(--text)]/60"><Loader2 className="h-4 w-4 animate-spin" /> Cargando home de RDB…</div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Requiere atención</h2>
              <p className="text-sm text-[var(--text)]/55">Alertas cortas, derivadas de pedidos y cortes que ya existen en RDB.</p>
            </div>
            {attention.length ? (
              <div className="grid gap-3 xl:grid-cols-3">{attention.map((alert) => <AttentionCard key={`${alert.title}-${alert.detail}`} alert={alert} />)}</div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">Sin alertas confiables por ahora. Lo operativo visible se ve estable.</div>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Ventas del periodo" value={formatMoney(sales)} hint={meta.rangeLabel} icon={<TrendingUp className="h-4 w-4" />} />
            <KpiCard label="Pedidos del periodo" value={String(orders)} hint={`${safeCount(cleanRows)} registrados`} icon={<ShoppingBag className="h-4 w-4" />} />
            <KpiCard label="Ticket promedio" value={formatMoney(avgTicket)} hint={orders ? `${orders} pedidos considerados` : 'Sin pedidos en el rango'} icon={<Receipt className="h-4 w-4" />} />
            <KpiCard label="Estado de cortes" value={openCorte ? 'Corte abierto' : latestCorte ? 'Sin corte abierto' : 'Sin datos'} hint={openCorte ? `${openCorte.corte_nombre ?? 'Corte actual'}${openCorte.caja_nombre ? ` · ${openCorte.caja_nombre}` : ''}` : latestCorte ? `Último: ${latestCorte.corte_nombre ?? 'corte reciente'}` : undefined} icon={<Scissors className="h-4 w-4" />} />
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">Ventas</h2>
                <p className="text-sm text-[var(--text)]/55">Serie principal del periodo seleccionado. El default es mes actual.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ['month', 'Mes actual'],
                  ['7d', '7 días'],
                  ['30d', '30 días'],
                  ['year', 'Año'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRange(key)}
                    className={[
                      'rounded-full border px-3 py-2 text-sm transition',
                      range === key
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/65 hover:text-[var(--text)]',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {range === 'month' ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">Vs mes anterior</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--text)]">{vsPrev == null ? '—' : `${vsPrev >= 0 ? '+' : ''}${vsPrev.toFixed(1)}%`}</div>
                  <div className="mt-1 text-sm text-[var(--text)]/55">Base: {formatMoney(previousTotal)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">Vs mismo mes año anterior</div>
                  <div className="mt-2 text-xl font-semibold text-[var(--text)]">{vsLastYear == null ? '—' : `${vsLastYear >= 0 ? '+' : ''}${vsLastYear.toFixed(1)}%`}</div>
                  <div className="mt-1 text-sm text-[var(--text)]/55">Base: {formatMoney(lastYearTotal)}</div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">Lectura del mes actual</div>
                  <div className="mt-2 text-sm text-[var(--text)]/65">Comparativo visual diario contra el mes anterior y el mismo mes del año pasado.</div>
                </div>
              </div>
            ) : null}

            <SalesChart data={chartData} showComparisons={range === 'month'} />

            {insights.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {insights.map((insight) => (
                  <div key={insight.label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/45">{insight.label}</div>
                    <div className="mt-2 text-sm font-medium text-[var(--text)]">{insight.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
