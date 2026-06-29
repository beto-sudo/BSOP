'use client';

/**
 * Vista del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047. Cuenta las
 * ventas que registraron la fase seleccionada en el periodo (fecha de registro
 * de la fase), con desglose por mes y detalle por operación. El filtro de fase
 * lo convierte en 17 reportes en uno; abre en la fase Detonada del mes corriente.
 * Export PDF + CSV con los filtros aplicados. Datos vía `useVentasPorFaseReporte`;
 * cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { inicioMesMatamoros } from '@/lib/fecha-mx';
import { FASES_VENTA } from '@/lib/dilesa/fases';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosVentasPorFase } from '@/lib/dilesa/reportes/ventas-por-fase-data';
import {
  construirVentasPorFase,
  POSICION_DEFAULT,
  POSICION_TODAS,
} from '@/lib/dilesa/reportes/ventas-por-fase';
import { etiquetaFaseFiltro } from '@/lib/dilesa/reportes/ventas-por-fase-filtros';
import { useVentasPorFaseReporte } from './use-ventas-por-fase-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('ventas-por-fase')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
// Abre en Detonada (12) del mes corriente. Default estable (se evalúa una vez al
// cargar el módulo), como exige `useUrlFilters`. Limpiar regresa a ese default.
const DEFAULT_FILTERS = {
  posicion: POSICION_DEFAULT,
  desde: inicioMesMatamoros(),
  hasta: '',
  proyecto: '',
};

const inputCls =
  'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]';
const selectCls =
  'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]';

export function VentasPorFaseView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { filas, loading, error, recargar } = useVentasPorFaseReporte();

  const result = useMemo(
    () =>
      construirVentasPorFase(filas, {
        posicion: filters.posicion,
        desde: filters.desde,
        hasta: filters.hasta,
        proyecto: filters.proyecto,
      }),
    [filas, filters]
  );
  const proys = useMemo(() => proyectosVentasPorFase(filas), [filas]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'fase', label: 'Fase', value: etiquetaFaseFiltro(filters.posicion) },
      { key: 'ventas', label: 'Ventas', value: result.totalVentas },
      {
        key: 'valor',
        label: 'Valor total',
        value: result.totalValor === 0 ? '—' : formatCurrency(result.totalValor, { compact: true }),
      },
    ],
    [result, filters.posicion]
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.posicion !== POSICION_DEFAULT) p.set('posicion', String(filters.posicion));
    if (filters.desde) p.set('desde', filters.desde);
    if (filters.hasta) p.set('hasta', filters.hasta);
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    return p.toString();
  }, [filters]);

  const pdfHref = `/api/dilesa/reportes/ventas-por-fase/pdf${queryString ? `?${queryString}` : ''}`;
  const csvHref = `/api/dilesa/reportes/ventas-por-fase/csv${queryString ? `?${queryString}` : ''}`;

  const filtros = (
    <>
      <select
        value={String(filters.posicion)}
        onChange={(e) => setFilter('posicion', Number(e.target.value))}
        className={selectCls}
      >
        <option value={String(POSICION_TODAS)}>Todas las fases</option>
        {FASES_VENTA.map((f) => (
          <option key={f.posicion} value={String(f.posicion)}>
            {f.posicion}. {f.nombre}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
        Desde
        <input
          type="date"
          value={filters.desde}
          onChange={(e) => setFilter('desde', e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[var(--text)]/60">
        Hasta
        <input
          type="date"
          value={filters.hasta}
          onChange={(e) => setFilter('hasta', e.target.value)}
          className={inputCls}
        />
      </label>
      <select
        value={filters.proyecto}
        onChange={(e) => setFilter('proyecto', e.target.value)}
        className={selectCls}
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
    <ReporteShell
      reporte={REPORTE}
      volverHref={VOLVER_HREF}
      pdfHref={pdfHref}
      csvHref={csvHref}
      filtros={filtros}
    >
      <ModuleKpiStrip stats={kpis} cols={3} />

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
          Ninguna venta registró esta fase en el periodo seleccionado.
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
                    {mm.ventas} {mm.ventas === 1 ? 'venta' : 'ventas'}
                  </div>
                  <div className="text-[11px] text-[var(--text)]/50">
                    {formatCurrency(mm.valor, { compact: true })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                  <th className="px-3 py-2.5 font-medium">Fecha</th>
                  {result.multiFase ? <th className="px-3 py-2.5 font-medium">Fase</th> : null}
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">
                    Unidad / proyecto
                  </th>
                  <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Tipo crédito</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Vendedor</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {result.filas.map((f) => (
                  <tr
                    key={f.id}
                    className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text)]/70">{f.fecha}</td>
                    {result.multiFase ? (
                      <td className="px-3 py-2.5 text-[var(--text)]/70">
                        {f.posicion}. {f.faseNombre}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{f.cliente}</td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 lg:table-cell">
                      {[f.unidadIdentificador, f.proyectoNombre].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 xl:table-cell">
                      {f.tipoCredito ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                      {f.vendedor ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                      {formatCurrency(f.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={result.multiFase ? 6 : 5}>
                    Total · {result.totalVentas} {result.totalVentas === 1 ? 'venta' : 'ventas'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                    {formatCurrency(result.totalValor)}
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
