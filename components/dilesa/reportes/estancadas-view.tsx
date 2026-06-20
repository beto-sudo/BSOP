'use client';

/**
 * Vista del reporte «Ventas estancadas» (DILESA · Ventas) — ADR-047.
 * Pipeline vivo ordenado por antigüedad en la fase actual; export PDF con los
 * filtros. Datos vía `useEstancadasReporte` (vista en DB); cálculo en el motor.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosDeEstancadas } from '@/lib/dilesa/reportes/estancadas-data';
import { construirEstancadas, UMBRAL_ESTANCADA_DEFAULT } from '@/lib/dilesa/reportes/estancadas';
import { useEstancadasReporte } from './use-estancadas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('estancadas')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '', minDias: '' };

export function EstancadasView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { filas, loading, error, recargar } = useEstancadasReporte();

  const result = useMemo(() => construirEstancadas(filas, filters), [filas, filters]);
  const proys = useMemo(() => proyectosDeEstancadas(filas), [filas]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'pipeline', label: 'En pipeline', value: result.totalPipeline },
      {
        key: 'estancadas',
        label: `Estancadas (≥${UMBRAL_ESTANCADA_DEFAULT}d)`,
        value: result.estancadas,
      },
      { key: 'max', label: 'Más antigua', value: `${result.maxDias} d` },
      { key: 'prom', label: 'Promedio', value: `${result.promedioDias} d` },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.minDias) p.set('minDias', filters.minDias);
    const qs = p.toString();
    return `/api/dilesa/reportes/estancadas/pdf${qs ? `?${qs}` : ''}`;
  }, [filters]);

  const filtros = (
    <>
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
        value={filters.minDias}
        onChange={(e) => setFilter('minDias', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Cualquier antigüedad</option>
        <option value="15">15+ días en fase</option>
        <option value="30">30+ días en fase</option>
        <option value="60">60+ días en fase</option>
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
      ) : result.totalPipeline === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin ventas en pipeline para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Comprador</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Fase actual</th>
                <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Vendedor</th>
                <th className="px-3 py-2.5 text-right font-medium">Días en fase</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Precio</th>
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.ventaId}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--text)]">{f.cliente}</div>
                    {f.unidadIdentificador || f.proyectoNombre ? (
                      <div className="text-[11px] text-[var(--text)]/45">
                        {[f.proyectoNombre, f.unidadIdentificador].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                    {f.faseActual ?? '—'}
                  </td>
                  <td className="hidden px-3 py-2.5 text-[var(--text)]/70 lg:table-cell">
                    {f.vendedor ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {f.diasEnFase >= UMBRAL_ESTANCADA_DEFAULT ? (
                      <Badge tone="warning">{f.diasEnFase} d</Badge>
                    ) : (
                      <span className="font-semibold tabular-nums text-[var(--text)]">
                        {f.diasEnFase} d
                      </span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/70 sm:table-cell">
                    {f.precio != null ? formatCurrency(f.precio) : '—'}
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
