'use client';

/**
 * Vista del reporte «Por tipo de crédito» (DILESA · Ventas) — ADR-047.
 * Distribución de la cartera por tipo de crédito; export PDF con el filtro
 * aplicado. Datos vía `useVentasReporte`; cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency, formatPercent } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosPresentes } from '@/lib/dilesa/reportes/ventas-data';
import { construirPorTipoCredito } from '@/lib/dilesa/reportes/por-tipo-credito';
import { useVentasReporte } from './use-ventas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('por-tipo-credito')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '' };

export function PorTipoCreditoView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { ventas, proyectos, loading, error, recargar } = useVentasReporte();

  const result = useMemo(() => construirPorTipoCredito(ventas, filters), [ventas, filters]);
  const proys = useMemo(() => proyectosPresentes(proyectos), [proyectos]);
  const maxVentas = useMemo(
    () => result.filas.reduce((max, f) => Math.max(max, f.ventas), 0),
    [result]
  );

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'ventas', label: 'Ventas', value: result.totalVentas },
      {
        key: 'monto',
        label: 'Monto total',
        value: result.totalMonto === 0 ? '—' : formatCurrency(result.totalMonto, { compact: true }),
      },
      { key: 'tipos', label: 'Tipos de crédito', value: result.filas.length },
      { key: 'dominante', label: 'Más usado', value: result.filas[0]?.tipo ?? '—' },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    const qs = p.toString();
    return `/api/dilesa/reportes/por-tipo-credito/pdf${qs ? `?${qs}` : ''}`;
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
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
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
      ) : result.totalVentas === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin ventas para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Tipo de crédito</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Distribución</th>
                <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                <th className="px-3 py-2.5 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.tipo}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">{f.tipo}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {f.ventas}
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]/70"
                          style={{
                            width: maxVentas === 0 ? '0%' : `${(f.ventas / maxVentas) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] tabular-nums text-[var(--text)]/45">
                        {formatPercent(f.pctVentas)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/80">
                    {f.monto > 0 ? formatCurrency(f.monto) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[11px] tabular-nums text-[var(--text)]/45">
                    {formatPercent(f.pctMonto)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                <td className="px-3 py-2.5 text-[var(--text)]">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {result.totalVentas}
                </td>
                <td className="hidden md:table-cell" />
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                  {formatCurrency(result.totalMonto)}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
