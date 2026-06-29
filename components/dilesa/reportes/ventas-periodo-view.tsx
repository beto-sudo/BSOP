'use client';

/**
 * Vista del reporte «Ventas del periodo» (DILESA · Ventas) — ADR-047.
 * Ventas escrituradas en el rango, desglose por mes y detalle; export PDF con
 * los filtros aplicados. Datos vía `useVentasReporte`; cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { inicioMesMatamoros } from '@/lib/fecha-mx';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosPresentes, vendedoresPresentes } from '@/lib/dilesa/reportes/ventas-data';
import { construirVentasPeriodo } from '@/lib/dilesa/reportes/ventas-periodo';
import { useVentasReporte } from './use-ventas-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('ventas-periodo')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
// Abre mostrando «lo que va del mes»: default `desde` = inicio del mes corriente
// (Matamoros). Estable (se evalúa una vez al cargar el módulo), como exige
// `useUrlFilters`. Limpiar filtros regresa al mes en curso.
const DEFAULT_FILTERS = { desde: inicioMesMatamoros(), hasta: '', proyecto: '', vendedor: '' };

export function VentasPeriodoView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { ventas, loading, error, recargar } = useVentasReporte();

  const result = useMemo(() => construirVentasPeriodo(ventas, filters), [ventas, filters]);
  const proys = useMemo(() => proyectosPresentes(ventas), [ventas]);
  const vendedores = useMemo(() => vendedoresPresentes(ventas), [ventas]);

  const mejorMes = useMemo(() => {
    if (result.porMes.length === 0) return null;
    return [...result.porMes].sort((a, b) => b.monto - a.monto)[0].mes;
  }, [result.porMes]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'escrituradas', label: 'Escrituradas', value: result.totalVentas },
      {
        key: 'monto',
        label: 'Monto total',
        value: result.totalMonto === 0 ? '—' : formatCurrency(result.totalMonto, { compact: true }),
      },
      {
        key: 'ticket',
        label: 'Ticket promedio',
        value:
          result.ticketPromedio === 0
            ? '—'
            : formatCurrency(result.ticketPromedio, { compact: true }),
      },
      { key: 'mejor_mes', label: 'Mejor mes', value: mejorMes ?? '—' },
    ],
    [result, mejorMes]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.desde) p.set('desde', filters.desde);
    if (filters.hasta) p.set('hasta', filters.hasta);
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.vendedor) p.set('vendedor', filters.vendedor);
    const qs = p.toString();
    return `/api/dilesa/reportes/ventas-periodo/pdf${qs ? `?${qs}` : ''}`;
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
      <select
        value={filters.vendedor}
        onChange={(e) => setFilter('vendedor', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los vendedores</option>
        {vendedores.map((v) => (
          <option key={v} value={v}>
            {v}
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
          Sin ventas escrituradas en el periodo seleccionado.
        </div>
      ) : (
        <div className="space-y-4">
          {result.porMes.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {result.porMes.map((mm) => (
                <div
                  key={mm.mes}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                >
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text)]/45">
                    {mm.mes}
                  </div>
                  <div className="text-sm font-semibold text-[var(--text)]">
                    {mm.ventas} · {formatCurrency(mm.monto, { compact: true })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                  <th className="px-3 py-2.5 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">Comprador</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">
                    Proyecto / unidad
                  </th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Vendedor</th>
                  <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {result.ventas.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text)]/70">
                      {v.fechaEscritura}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{v.cliente}</td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                      {[v.proyectoNombre, v.unidadIdentificador].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 lg:table-cell">
                      {v.vendedor ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                      {formatCurrency(v.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={4}>
                    Total ({result.totalVentas})
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                    {formatCurrency(result.totalMonto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </ReporteShell>
  );
}
