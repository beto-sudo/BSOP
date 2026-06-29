'use client';

/**
 * Vista del reporte «Detonaciones / Depósitos» (DILESA · Ventas) — ADR-047.
 * Depósitos recibidos en el rango, desglose por mes y por origen (cliente vs
 * institución), detalle por operación y sección de depósitos sin ligar. Export
 * PDF + CSV con los filtros aplicados. Datos vía `useDetonacionesReporte`;
 * cálculo vía el motor puro.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { inicioMesMatamoros } from '@/lib/fecha-mx';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import {
  etiquetaFuente,
  proyectosDepositos,
  type DepositoReporteRow,
} from '@/lib/dilesa/reportes/detonaciones-data';
import { construirDetonaciones } from '@/lib/dilesa/reportes/detonaciones';
import { useDetonacionesReporte } from './use-detonaciones-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('depositos-periodo')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
// Abre mostrando «lo que va del mes»: default `desde` = inicio del mes corriente
// (Matamoros). Estable (se evalúa una vez al cargar el módulo), como exige
// `useUrlFilters`. Limpiar filtros regresa al mes en curso, no a histórico total.
const DEFAULT_FILTERS = { desde: inicioMesMatamoros(), hasta: '', fuente: '', proyecto: '' };

const inputCls =
  'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)]';

function FuenteBadge({ row }: { row: DepositoReporteRow }) {
  const esInst = row.fuente === 'institucion';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        esInst
          ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'bg-[var(--bg)]/60 text-[var(--text)]/60'
      }`}
    >
      {etiquetaFuente(row.fuente)}
    </span>
  );
}

export function DetonacionesView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { depositos, loading, error, recargar } = useDetonacionesReporte();

  const result = useMemo(
    () =>
      construirDetonaciones(depositos, {
        desde: filters.desde,
        hasta: filters.hasta,
        fuente: filters.fuente as '' | 'cliente' | 'institucion' | 'otro',
        proyecto: filters.proyecto,
      }),
    [depositos, filters]
  );
  const proys = useMemo(() => proyectosDepositos(depositos), [depositos]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'depositos', label: 'Depósitos', value: result.totalDepositos },
      {
        key: 'monto',
        label: 'Monto total',
        value: result.totalMonto === 0 ? '—' : formatCurrency(result.totalMonto, { compact: true }),
      },
      {
        key: 'institucion',
        label: 'Institución (detonaciones)',
        value:
          result.totalInstitucion === 0
            ? '—'
            : formatCurrency(result.totalInstitucion, { compact: true }),
      },
      {
        key: 'cliente',
        label: 'Cliente',
        value:
          result.totalCliente === 0 ? '—' : formatCurrency(result.totalCliente, { compact: true }),
      },
    ],
    [result]
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.desde) p.set('desde', filters.desde);
    if (filters.hasta) p.set('hasta', filters.hasta);
    if (filters.fuente) p.set('fuente', filters.fuente);
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    return p.toString();
  }, [filters]);

  const pdfHref = `/api/dilesa/reportes/depositos-periodo/pdf${queryString ? `?${queryString}` : ''}`;
  const csvHref = `/api/dilesa/reportes/depositos-periodo/csv${queryString ? `?${queryString}` : ''}`;

  const filtros = (
    <>
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
        value={filters.fuente}
        onChange={(e) => setFilter('fuente', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los orígenes</option>
        <option value="institucion">Solo institución (detonaciones)</option>
        <option value="cliente">Solo cliente</option>
      </select>
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
    <ReporteShell
      reporte={REPORTE}
      volverHref={VOLVER_HREF}
      pdfHref={pdfHref}
      csvHref={csvHref}
      filtros={filtros}
    >
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
      ) : result.totalDepositos === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          Sin depósitos en el periodo seleccionado.
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
                    {mm.depositos} · {formatCurrency(mm.monto, { compact: true })}
                  </div>
                  <div className="text-[11px] text-[var(--text)]/50">
                    Inst. {formatCurrency(mm.montoInstitucion, { compact: true })} · Cli.{' '}
                    {formatCurrency(mm.montoCliente, { compact: true })}
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
                  <th className="px-3 py-2.5 font-medium">Origen</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">
                    Unidad / proyecto
                  </th>
                  <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Tipo crédito</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Forma / ref.</th>
                  <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Cuenta</th>
                  <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {result.depositos.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text)]/70">{d.fecha}</td>
                    <td className="px-3 py-2.5">
                      <FuenteBadge row={d} />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{d.cliente}</td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 lg:table-cell">
                      {[d.unidadIdentificador, d.proyectoNombre].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 xl:table-cell">
                      {d.tipoCredito ?? '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 md:table-cell">
                      {[d.formaPago, d.referencia].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="hidden px-3 py-2.5 text-[var(--text)]/70 xl:table-cell">
                      {d.cuentaBancaria ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                      {formatCurrency(d.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={7}>
                    Total ({result.totalDepositos}) · Inst.{' '}
                    {formatCurrency(result.totalInstitucion)} · Cli.{' '}
                    {formatCurrency(result.totalCliente)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                    {formatCurrency(result.totalMonto)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {result.sinLigar.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text)]/70">
                Depósitos sin ligar a una venta ({result.sinLigar.length})
              </h3>
              <p className="text-xs text-[var(--text)]/45">
                Abonos registrados en Cobranza que aún no se aplican a una venta. Revisar para el
                cuadre.
              </p>
              <div className="overflow-x-auto rounded-xl border border-dashed border-[var(--border)]">
                <table className="w-full text-sm">
                  <tbody>
                    {result.sinLigar.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--border)]/40 last:border-0">
                        <td className="px-3 py-2 tabular-nums text-[var(--text)]/70">{d.fecha}</td>
                        <td className="px-3 py-2">
                          <FuenteBadge row={d} />
                        </td>
                        <td className="px-3 py-2 text-[var(--text)]/60">
                          {[d.formaPago, d.referencia].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">
                          {formatCurrency(d.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </ReporteShell>
  );
}
