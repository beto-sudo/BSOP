'use client';

/**
 * Vista del reporte «Escrituración programada» (DILESA · Ventas) — ADR-047.
 * La agenda de firmas (fase 10) con su estado; export PDF con los filtros.
 * Datos vía `useVentasReporte`; cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosPresentes } from '@/lib/dilesa/reportes/ventas-data';
import { construirEscrituracionProgramada } from '@/lib/dilesa/reportes/escrituracion-programada';
import { useVentasReporte } from './use-ventas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('escrituracion-programada')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { desde: '', hasta: '', proyecto: '' };

export function EscrituracionProgramadaView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { ventas, loading, error, recargar } = useVentasReporte();

  const result = useMemo(
    () => construirEscrituracionProgramada(ventas, filters),
    [ventas, filters]
  );
  const proys = useMemo(() => proyectosPresentes(ventas), [ventas]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'firmas', label: 'Firmas agendadas', value: result.totalFirmas },
      { key: 'pendientes', label: 'Pendientes', value: result.totalPendientes },
      {
        key: 'monto',
        label: 'Monto agendado',
        value: result.totalMonto === 0 ? '—' : formatCurrency(result.totalMonto, { compact: true }),
      },
      { key: 'ultima', label: 'Fecha más reciente', value: result.firmas[0]?.fecha ?? '—' },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.desde) p.set('desde', filters.desde);
    if (filters.hasta) p.set('hasta', filters.hasta);
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    const qs = p.toString();
    return `/api/dilesa/reportes/escrituracion-programada/pdf${qs ? `?${qs}` : ''}`;
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
      ) : result.totalFirmas === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin firmas programadas para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Hora</th>
                <th className="px-3 py-2.5 font-medium">Comprador</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Proyecto / unidad</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {result.firmas.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-[var(--text)]">
                    {f.fecha}
                  </td>
                  <td className="hidden px-3 py-2.5 tabular-nums text-[var(--text)]/60 sm:table-cell">
                    {f.hora ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]">{f.cliente}</td>
                  <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                    {[f.proyectoNombre, f.unidadIdentificador].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={f.escriturada ? 'success' : 'warning'}>
                      {f.escriturada ? 'Escriturada' : 'Pendiente'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {formatCurrency(f.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                <td className="px-3 py-2.5 text-[var(--text)]" colSpan={5}>
                  Total ({result.totalFirmas} firmas · {result.totalPendientes} pendientes)
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                  {formatCurrency(result.totalMonto)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
