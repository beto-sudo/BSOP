'use client';

/**
 * Vista del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 * Unidades vendibles agrupadas por proyecto + prototipo; export PDF con los
 * filtros. Datos vía `useInventarioReporte`; cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosDeUnidades, prototiposDeUnidades } from '@/lib/dilesa/reportes/inventario-data';
import { construirInventarioDisponible } from '@/lib/dilesa/reportes/inventario-disponible';
import { useInventarioReporte } from './use-inventario-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('inventario-disponible')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '', prototipo: '' };

export function InventarioDisponibleView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { unidades, loading, error, recargar } = useInventarioReporte();

  const result = useMemo(
    () => construirInventarioDisponible(unidades, filters),
    [unidades, filters]
  );
  const proys = useMemo(() => proyectosDeUnidades(unidades), [unidades]);
  const protos = useMemo(() => prototiposDeUnidades(unidades), [unidades]);
  const maxDisp = useMemo(
    () => result.grupos.reduce((max, g) => Math.max(max, g.disponibles), 0),
    [result]
  );

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'disponibles', label: 'Disponibles', value: result.totalDisponibles },
      { key: 'construccion', label: 'En construcción', value: result.totalEnConstruccion },
      { key: 'terminadas', label: 'Terminadas', value: result.totalTerminadas },
      { key: 'proyectos', label: 'Proyectos', value: result.totalProyectos },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.prototipo) p.set('prototipo', filters.prototipo);
    const qs = p.toString();
    return `/api/dilesa/reportes/inventario-disponible/pdf${qs ? `?${qs}` : ''}`;
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
        value={filters.prototipo}
        onChange={(e) => setFilter('prototipo', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los prototipos</option>
        {protos.map((p) => (
          <option key={p} value={p}>
            {p}
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
      ) : result.totalDisponibles === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin unidades disponibles para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Proyecto</th>
                <th className="px-3 py-2.5 font-medium">Prototipo</th>
                <th className="px-3 py-2.5 text-right font-medium">Disponibles</th>
                <th className="hidden px-3 py-2.5 md:table-cell" />
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  En constr.
                </th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  Terminadas
                </th>
              </tr>
            </thead>
            <tbody>
              {result.grupos.map((g) => (
                <tr
                  key={`${g.proyecto}::${g.prototipo}`}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">{g.proyecto}</td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">{g.prototipo}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {g.disponibles}
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]/70"
                        style={{
                          width: maxDisp === 0 ? '0%' : `${(g.disponibles / maxDisp) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60 sm:table-cell">
                    {g.enConstruccion}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60 sm:table-cell">
                    {g.terminadas}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                <td className="px-3 py-2.5 text-[var(--text)]" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                  {result.totalDisponibles}
                </td>
                <td className="hidden md:table-cell" />
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)] sm:table-cell">
                  {result.totalEnConstruccion}
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-[var(--text)] sm:table-cell">
                  {result.totalTerminadas}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
