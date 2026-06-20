'use client';

/**
 * Vista del reporte «Productividad por vendedor» (DILESA · Ventas) — ADR-047.
 * Scorecard por vendedor (cartera, pipeline, escrituradas, % cierre, monto);
 * export PDF con el filtro aplicado. Datos vía `useVentasReporte`.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency, formatPercent } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosPresentes } from '@/lib/dilesa/reportes/ventas-data';
import { construirProductividadVendedor } from '@/lib/dilesa/reportes/productividad-vendedor';
import { useVentasReporte } from './use-ventas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('productividad-vendedor')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '' };

export function ProductividadVendedorView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { ventas, proyectos, loading, error, recargar } = useVentasReporte();

  const result = useMemo(() => construirProductividadVendedor(ventas, filters), [ventas, filters]);
  const proys = useMemo(() => proyectosPresentes(proyectos), [proyectos]);
  const maxMonto = useMemo(
    () => result.filas.reduce((max, f) => Math.max(max, f.montoEscriturado), 0),
    [result]
  );

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'vendedores', label: 'Vendedores', value: result.totalVendedores },
      { key: 'top', label: 'Top vendedor', value: result.filas[0]?.vendedor ?? '—' },
      { key: 'escrituradas', label: 'Escrituradas', value: result.totalEscrituradas },
      {
        key: 'monto',
        label: 'Monto escriturado',
        value:
          result.totalMontoEscriturado === 0
            ? '—'
            : formatCurrency(result.totalMontoEscriturado, { compact: true }),
      },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    const qs = p.toString();
    return `/api/dilesa/reportes/productividad-vendedor/pdf${qs ? `?${qs}` : ''}`;
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
      ) : result.totalVendedores === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin ventas con vendedor asignado para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Vendedor</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  Pipeline
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Escrit.</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  % cierre
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Escriturado</th>
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.vendedor}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--text)]">{f.vendedor}</div>
                    <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]/70"
                        style={{
                          width:
                            maxMonto === 0 ? '0%' : `${(f.montoEscriturado / maxMonto) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/80">
                    {f.ventas}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/70 sm:table-cell">
                    {f.pipeline > 0 ? formatCurrency(f.pipeline, { compact: true }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/80">
                    {f.escrituradas}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60 sm:table-cell">
                    {formatPercent(f.pctEscrituradas)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {f.montoEscriturado > 0 ? formatCurrency(f.montoEscriturado) : '—'}
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
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)] sm:table-cell">
                  {formatCurrency(result.totalPipeline, { compact: true })}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">
                  {result.totalEscrituradas}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                  {formatCurrency(result.totalMontoEscriturado)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
