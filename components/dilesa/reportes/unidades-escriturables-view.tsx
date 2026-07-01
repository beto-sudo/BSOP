'use client';

/**
 * Vista del reporte «Unidades escriturables» (DILESA · Ventas) — ADR-047.
 *
 * Qué se puede firmar YA: unidades con obra terminada + extracción del RUV
 * capturada, tanto en inventario como asignadas sin escriturar. El toggle
 * «Todas las candidatas» expone además qué detiene al resto (falta extracción
 * vs obra en proceso). Datos vía `useEscriturablesReporte`; export PDF con
 * los filtros actuales.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatDate } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosDeEscriturables } from '@/lib/dilesa/reportes/escriturables-data';
import {
  construirUnidadesEscriturables,
  estatusEscriturable,
  type FiltrosEscriturables,
} from '@/lib/dilesa/reportes/unidades-escriturables';
import { useEscriturablesReporte } from './use-escriturables-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('unidades-escriturables')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '', situacion: '', mostrar: 'escriturables' };

const fecha = (iso: string | null) =>
  iso ? formatDate(iso) : <span className="text-[var(--text)]/30">—</span>;

export function UnidadesEscriturablesView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { unidades, loading, error, recargar } = useEscriturablesReporte();

  const filtros: FiltrosEscriturables = useMemo(
    () => ({
      proyecto: filters.proyecto,
      situacion: (filters.situacion as '' | 'inventario' | 'asignada') || '',
      mostrar: filters.mostrar === 'todas' ? 'todas' : 'escriturables',
    }),
    [filters]
  );
  const result = useMemo(
    () => construirUnidadesEscriturables(unidades, filtros),
    [unidades, filtros]
  );
  const proys = useMemo(() => proyectosDeEscriturables(unidades), [unidades]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'escriturables', label: 'Escriturables', value: result.escriturables },
      { key: 'inventario', label: 'En inventario', value: result.enInventario },
      { key: 'asignadas', label: 'Asignadas s/escriturar', value: result.asignadas },
      { key: 'falta_ext', label: 'Falta extracción', value: result.faltaExtraccion },
      { key: 'obra', label: 'Obra en proceso', value: result.obraEnProceso },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filtros.proyecto) p.set('proyecto', filtros.proyecto);
    if (filtros.situacion) p.set('situacion', filtros.situacion);
    if (filtros.mostrar !== 'escriturables') p.set('mostrar', filtros.mostrar);
    const qs = p.toString();
    return `/api/dilesa/reportes/unidades-escriturables/pdf${qs ? `?${qs}` : ''}`;
  }, [filtros]);

  const filtrosUi = (
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
        value={filters.situacion}
        onChange={(e) => setFilter('situacion', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Inventario + asignadas</option>
        <option value="inventario">Solo inventario</option>
        <option value="asignada">Solo asignadas</option>
      </select>
      <select
        value={filters.mostrar}
        onChange={(e) => setFilter('mostrar', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="escriturables">Solo escriturables</option>
        <option value="todas">Todas las candidatas</option>
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
    <ReporteShell reporte={REPORTE} volverHref={VOLVER_HREF} pdfHref={pdfHref} filtros={filtrosUi}>
      <ModuleKpiStrip stats={kpis} cols={5} />

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
      ) : result.unidades.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--text)]/50">
          {filtros.mostrar === 'escriturables'
            ? 'Ninguna unidad escriturable para los filtros seleccionados.'
            : 'Sin unidades candidatas para los filtros seleccionados.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Unidad</th>
                <th className="px-3 py-2.5 font-medium">Proyecto / prototipo</th>
                <th className="px-3 py-2.5 font-medium">Situación</th>
                <th className="px-3 py-2.5 font-medium">Obra terminada</th>
                <th className="px-3 py-2.5 font-medium">DTU</th>
                <th className="px-3 py-2.5 font-medium">Extracción</th>
                <th className="px-3 py-2.5 font-medium">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {result.unidades.map((u) => (
                <tr
                  key={u.unidadId}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">
                    {u.identificadorCompleto}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">
                    {[u.proyectoNombre, u.prototipo].filter(Boolean).join(' · ')}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.situacion === 'inventario' ? (
                      <Badge tone="neutral">Inventario</Badge>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone="info">Asignada</Badge>
                        <span className="text-xs text-[var(--text)]/60">
                          {u.cliente}
                          {u.faseActual ? ` · ${u.faseActual}` : ''}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">
                    {u.obraTerminada ? (
                      u.fechaObraTerminada ? (
                        formatDate(u.fechaObraTerminada)
                      ) : (
                        'Sí'
                      )
                    ) : (
                      <span className="text-[var(--text)]/40">En proceso</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">{fecha(u.fechaDtu)}</td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">{fecha(u.fechaExtraccion)}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={u.escriturable ? 'success' : u.obraTerminada ? 'warning' : 'info'}>
                      {estatusEscriturable(u)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                <td className="px-3 py-2.5 text-[var(--text)]" colSpan={7}>
                  {result.unidades.length} unidades
                  {filtros.mostrar === 'escriturables'
                    ? ` escriturables (de ${result.totalCandidatas} candidatas)`
                    : ` candidatas · ${result.escriturables} escriturables`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
