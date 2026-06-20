'use client';

/**
 * Vista del reporte «Ventas desasignadas» (DILESA · Ventas) — ADR-047.
 * Las ventas desasignadas con su motivo, clasificadas en Reubicación vs Baja;
 * export PDF con los filtros. Datos vía `useDesasignadasReporte`.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatPercent } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosDeDesasignadas } from '@/lib/dilesa/reportes/desasignadas-data';
import { construirDesasignadas } from '@/lib/dilesa/reportes/desasignadas';
import { useDesasignadasReporte } from './use-desasignadas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('desasignadas')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { desde: '', hasta: '', proyecto: '', categoria: '' };

export function DesasignadasView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { filas, loading, error, recargar } = useDesasignadasReporte();

  const result = useMemo(
    () =>
      construirDesasignadas(filas, {
        desde: filters.desde,
        hasta: filters.hasta,
        proyecto: filters.proyecto,
        categoria: (filters.categoria as '' | 'reubicacion' | 'baja') || '',
      }),
    [filas, filters]
  );
  const proys = useMemo(() => proyectosDeDesasignadas(filas), [filas]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'total', label: 'Desasignadas', value: result.total },
      { key: 'reubic', label: 'Reubicaciones', value: result.reubicaciones },
      { key: 'bajas', label: 'Bajas', value: result.bajas },
      {
        key: 'pct',
        label: '% bajas',
        value: result.total === 0 ? '—' : formatPercent(result.bajas / result.total),
      },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.desde) p.set('desde', filters.desde);
    if (filters.hasta) p.set('hasta', filters.hasta);
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.categoria) p.set('categoria', filters.categoria);
    const qs = p.toString();
    return `/api/dilesa/reportes/desasignadas/pdf${qs ? `?${qs}` : ''}`;
  }, [filters]);

  const filtros = (
    <>
      <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
        Desde
        <input
          type="date"
          value={filters.desde}
          onChange={(e) => setFilter('desde', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
        Hasta
        <input
          type="date"
          value={filters.hasta}
          onChange={(e) => setFilter('hasta', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]"
        />
      </label>
      <select
        value={filters.proyecto}
        onChange={(e) => setFilter('proyecto', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los proyectos</option>
        {proys.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        value={filters.categoria}
        onChange={(e) => setFilter('categoria', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los tipos</option>
        <option value="reubicacion">Solo reubicaciones</option>
        <option value="baja">Solo bajas</option>
      </select>
      {activeCount > 0 ? (
        <button
          type="button"
          onClick={() => clearAll()}
          className="text-xs text-[var(--text)]/60 underline hover:text-[var(--text)]"
        >
          Limpiar filtros
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void recargar()}
        className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refrescar
      </button>
    </>
  );

  return (
    <ReporteShell reporte={REPORTE} volverHref={VOLVER_HREF} pdfHref={pdfHref} filtros={filtros}>
      <ModuleKpiStrip stats={kpis} cols={4} />

      {error ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
          <button
            type="button"
            onClick={() => void recargar()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : result.total === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin ventas desasignadas para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Comprador</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Vendedor</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 tabular-nums text-[var(--text)]/70">{f.fecha}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--text)]">{f.cliente}</div>
                    {f.unidadIdentificador || f.proyectoNombre ? (
                      <div className="text-[11px] text-[var(--text)]/45">
                        {[f.proyectoNombre, f.unidadIdentificador].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--text)]/70 lg:table-cell">
                    {f.vendedor ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={f.categoria === 'baja' ? 'warning' : 'neutral'}>
                      {f.categoria === 'baja' ? 'Baja' : 'Reubicación'}
                    </Badge>
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5 text-[var(--text)]/70">
                    {f.motivo ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
