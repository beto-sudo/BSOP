'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getLocalDayBoundsUtc } from '@/lib/timezone';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorBanner } from '@/components/module-page';
import { Download } from 'lucide-react';
import { CategoriaBadge } from './categoria-badge';
import { TZ } from './utils';
import {
  etiquetaCorta,
  etiquetaMes,
  fechaEnTz,
  hoyEnTz,
  indiceSemana,
  inicioMes,
  ventanaSemanas,
} from './semana-utils';

// Líneas sin producto en catálogo → "Sin categoría". Mismo criterio que el
// tab "Por categoría" para que los números reconcilien.
const SIN_CATEGORIA_KEY = 'sin-categoria';
const SIN_CATEGORIA_LABEL = 'Sin categoría';
const N_SEMANAS = 6;
// Chunk del `.in('order_id', …)` — el mismo tamaño que usa el tab "Por
// categoría", validado contra el límite de longitud de URL de PostgREST.
const CHUNK = 500;

type Metric = 'importe' | 'unidades';

type LineaCategoria = {
  order_id: string;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  quantity: number | null;
  total_price: number | null;
};

type PedidoMeta = { weekIdx: number; inMonth: boolean };

type AggRow = {
  key: string;
  nombre: string;
  color: string | null;
  importeSem: number[];
  unidadesSem: number[];
  importeMes: number;
  unidadesMes: number;
};

export function VentasComparativo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agg, setAgg] = useState<AggRow[]>([]);
  const [metric, setMetric] = useState<Metric>('importe');

  // Ventana fija: últimas 6 semanas ISO + mes en curso. Independiente del
  // filtro global de fechas/corte de VentasView — este tab siempre mira el
  // comportamiento reciente, sin importar qué rango haya elegido el usuario.
  const { semanas, mesInicio, mesLabel, rangoUtc } = useMemo(() => {
    const now = new Date();
    const sems = ventanaSemanas(now, N_SEMANAS, TZ);
    const hoy = hoyEnTz(now, TZ);
    return {
      semanas: sems,
      mesInicio: inicioMes(hoy),
      mesLabel: etiquetaMes(hoy),
      rangoUtc: {
        start: getLocalDayBoundsUtc(sems[0].inicio, TZ).start,
        end: getLocalDayBoundsUtc(hoy, TZ).end,
      },
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      // 1) Pedidos válidos en la ventana: misma vista canónica que "Por
      //    categoría" (excluye fantasmas ADR-031, sólo paid=true). El
      //    timestamp ubica cada pedido en su semana ISO y su mes calendario.
      const { data: pedidos, error: pedErr } = await supabase
        .schema('rdb')
        .from('v_waitry_pedidos')
        .select('order_id, status, timestamp')
        .gte('timestamp', rangoUtc.start)
        .lte('timestamp', rangoUtc.end)
        .limit(20000);
      if (pedErr) throw pedErr;

      const meta = new Map<string, PedidoMeta>();
      for (const p of pedidos ?? []) {
        if (!p.order_id || !p.timestamp) continue;
        if ((p.status ?? '').toLowerCase().includes('cancel')) continue;
        const fecha = fechaEnTz(p.timestamp, TZ);
        const weekIdx = indiceSemana(fecha, semanas);
        if (weekIdx < 0) continue;
        meta.set(p.order_id, { weekIdx, inMonth: fecha >= mesInicio });
      }

      const orderIds = [...meta.keys()];
      if (orderIds.length === 0) {
        setAgg([]);
        return;
      }

      // 2) Líneas con categoría de esos pedidos, chunked por el límite de URL.
      const lineas: LineaCategoria[] = [];
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        const { data, error: linErr } = await supabase
          .schema('rdb')
          .from('v_waitry_productos_categoria')
          .select(
            'order_id, categoria_id, categoria_nombre, categoria_color, quantity, total_price'
          )
          .in('order_id', chunk)
          .limit(50000);
        if (linErr) throw linErr;
        lineas.push(...((data ?? []) as LineaCategoria[]));
      }

      // 3) Pivote categoría × semana, acumulando importe y unidades en paralelo
      //    para que el toggle de métrica no dispare otra query.
      const map = new Map<string, AggRow>();
      for (const ln of lineas) {
        const m = meta.get(ln.order_id);
        if (!m) continue;
        const key = ln.categoria_id ?? SIN_CATEGORIA_KEY;
        let row = map.get(key);
        if (!row) {
          row = {
            key,
            nombre: ln.categoria_nombre ?? SIN_CATEGORIA_LABEL,
            color: ln.categoria_color,
            importeSem: Array.from({ length: N_SEMANAS }, () => 0),
            unidadesSem: Array.from({ length: N_SEMANAS }, () => 0),
            importeMes: 0,
            unidadesMes: 0,
          };
          map.set(key, row);
        }
        const imp = Number(ln.total_price ?? 0);
        const uni = Number(ln.quantity ?? 0);
        row.importeSem[m.weekIdx] += imp;
        row.unidadesSem[m.weekIdx] += uni;
        if (m.inMonth) {
          row.importeMes += imp;
          row.unidadesMes += uni;
        }
      }

      setAgg([...map.values()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar el comparativo semanal');
    } finally {
      setLoading(false);
    }
  }, [semanas, mesInicio, rangoUtc.start, rangoUtc.end]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Filas en la métrica activa, sin categorías vacías, ordenadas por Σ6sem desc
  // (mismo criterio "mayor a menor" que la hoja de RDB).
  const rows = useMemo(() => {
    const semKey = metric === 'importe' ? 'importeSem' : 'unidadesSem';
    const mesKey = metric === 'importe' ? 'importeMes' : 'unidadesMes';
    return agg
      .map((r) => {
        const sem = r[semKey];
        return {
          key: r.key,
          nombre: r.nombre,
          color: r.color,
          sem,
          sigma: sem.reduce((a, b) => a + b, 0),
          mes: r[mesKey],
        };
      })
      .filter((r) => r.sigma !== 0 || r.mes !== 0)
      .sort((a, b) => b.sigma - a.sigma);
  }, [agg, metric]);

  const totals = useMemo(() => {
    const sem = Array.from({ length: N_SEMANAS }, () => 0);
    let sigma = 0;
    let mes = 0;
    for (const r of rows) {
      for (let i = 0; i < N_SEMANAS; i++) sem[i] += r.sem[i];
      sigma += r.sigma;
      mes += r.mes;
    }
    return { sem, sigma, mes };
  }, [rows]);

  const fmt = (v: number) =>
    v === 0
      ? '—'
      : metric === 'importe'
        ? formatCurrency(v, { decimals: 0 })
        : v.toLocaleString('es-MX');

  const exportCsv = () => {
    const header = [
      'Categoría',
      ...semanas.map((s) => `S${s.isoSemana} (${s.inicio})`),
      'Sigma 6 sem',
      `Acum ${mesLabel}`,
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          `"${r.nombre.replace(/"/g, '""')}"`,
          ...r.sem.map((v) => String(v)),
          String(r.sigma),
          String(r.mes),
        ].join(',')
      );
    }
    lines.push(
      [
        '"TOTAL"',
        ...totals.sem.map((v) => String(v)),
        String(totals.sigma),
        String(totals.mes),
      ].join(',')
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rdb-comparativo-${metric}-${semanas[0].inicio}_${hoyEnTz(new Date(), TZ)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Últimas {N_SEMANAS} semanas ISO (lun–dom) · cancha + tiendita (Waitry).{' '}
          <span className="text-muted-foreground/70">
            La semana {semanas[N_SEMANAS - 1].isoSemana} va en curso.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            {(
              [
                ['importe', 'Importe'],
                ['unidades', 'Unidades'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition',
                  metric === k
                    ? 'bg-emerald-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!rows.length}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner error={error} onRetry={() => void fetchData()} /> : null}

      {loading ? (
        <div className="h-72 animate-pulse rounded-xl border bg-muted/30" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Sin ventas registradas en las últimas {N_SEMANAS} semanas.
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Categoría</TableHead>
                {semanas.map((s) => (
                  <TableHead key={s.inicio} className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span className={cn('font-semibold', s.enCurso && 'text-emerald-600')}>
                        S{s.isoSemana}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {etiquetaCorta(s.inicio)}
                      </span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Σ 6 sem</TableHead>
                <TableHead className="text-right">Acum. {mesLabel}</TableHead>
                <TableHead className="text-right">Tend.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="sticky left-0 bg-card">
                    <CategoriaBadge nombre={r.nombre} color={r.color} />
                  </TableCell>
                  {r.sem.map((v, i) => (
                    <TableCell
                      key={semanas[i].inicio}
                      className={cn(
                        'text-right tabular-nums',
                        v === 0 && 'text-muted-foreground/40',
                        semanas[i].enCurso && v !== 0 && 'text-emerald-700/90'
                      )}
                    >
                      {fmt(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(r.sigma)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {fmt(r.mes)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Sparkline values={r.sem} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0 bg-muted/50 font-semibold">TOTAL</TableCell>
                {totals.sem.map((v, i) => (
                  <TableCell
                    key={semanas[i].inicio}
                    className="text-right font-semibold tabular-nums"
                  >
                    {fmt(v)}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold tabular-nums">
                  {fmt(totals.sigma)}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">
                  {fmt(totals.mes)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}

/**
 * Sparkline mínimo (polyline SVG) para la columna de tendencia. Sin librería de
 * charts — el repo no tiene una y no la vale para 6 puntos. Verde si la última
 * semana sube vs la anterior, rojo si baja.
 */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0);
  if (max <= 0) return <span className="text-muted-foreground/40">—</span>;
  const w = 72;
  const h = 22;
  const pad = 2;
  const n = values.length;
  const points = values
    .map((v, i) => {
      const x = n > 1 ? pad + (i / (n - 1)) * (w - 2 * pad) : w / 2;
      const y = h - pad - (v / max) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const sube = n < 2 || values[n - 1] >= values[n - 2];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className={cn('inline-block', sube ? 'text-emerald-500' : 'text-rose-500')}
      role="img"
      aria-label="Tendencia de las últimas semanas"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
