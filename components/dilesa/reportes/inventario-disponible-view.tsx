'use client';

/**
 * Vista del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 * Cada unidad vendible con su precio DESGLOSADO (base + excedente + esquina +
 * frente verde + venta futuro = total), igual que el módulo Inventario.
 * Datos vía `useInventarioReporte`; export PDF con los filtros.
 */
import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import { proyectosDeUnidades, prototiposDeUnidades } from '@/lib/dilesa/reportes/inventario-data';
import { construirInventarioDisponible } from '@/lib/dilesa/reportes/inventario-disponible';
import { useInventarioReporte } from './use-inventario-reporte';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('inventario-disponible')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';
const DEFAULT_FILTERS = { proyecto: '', prototipo: '', caracteristica: '' };

const money = (n: number | null) => (n && n > 0 ? formatCurrency(n) : '—');

export function InventarioDisponibleView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);
  const { unidades, loading, error, recargar } = useInventarioReporte();

  const result = useMemo(
    () =>
      construirInventarioDisponible(unidades, {
        proyecto: filters.proyecto,
        prototipo: filters.prototipo,
        caracteristica: (filters.caracteristica as '' | 'esquina' | 'frente_verde') || '',
      }),
    [unidades, filters]
  );
  const proys = useMemo(() => proyectosDeUnidades(unidades), [unidades]);
  const protos = useMemo(() => prototiposDeUnidades(unidades), [unidades]);

  const kpis = useMemo<readonly ModuleKpi[]>(
    () => [
      { key: 'disponibles', label: 'Disponibles', value: result.totalDisponibles },
      { key: 'construccion', label: 'En construcción', value: result.enConstruccion },
      { key: 'terminadas', label: 'Terminadas', value: result.terminadas },
      {
        key: 'valor',
        label: 'Valor disponible',
        value: result.valorTotal === 0 ? '—' : formatCurrency(result.valorTotal, { compact: true }),
      },
    ],
    [result]
  );

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.prototipo) p.set('prototipo', filters.prototipo);
    if (filters.caracteristica) p.set('caracteristica', filters.caracteristica);
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
      <select
        value={filters.caracteristica}
        onChange={(e) => setFilter('caracteristica', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Cualquier característica</option>
        <option value="esquina">Solo esquinas</option>
        <option value="frente_verde">Solo frente verde</option>
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
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="px-3 py-2.5 font-medium">Unidad</th>
                <th className="px-3 py-2.5 font-medium">Proyecto / prototipo</th>
                <th className="px-3 py-2.5 text-right font-medium">Área m²</th>
                <th className="px-3 py-2.5 font-medium">Caract.</th>
                <th className="px-3 py-2.5 text-right font-medium">Base</th>
                <th className="px-3 py-2.5 text-right font-medium">Excedente</th>
                <th className="px-3 py-2.5 text-right font-medium">Esquina</th>
                <th className="px-3 py-2.5 text-right font-medium">F. verde</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.unidades.map((un) => (
                <tr
                  key={un.id}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">
                    {un.identificadorCompleto}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text)]/70">
                    {[un.proyectoNombre, un.prototipo].filter(Boolean).join(' · ')}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/70">
                    {un.areaM2 != null ? un.areaM2.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {un.esEsquina ? <Badge tone="info">Esquina</Badge> : null}
                      {un.tieneFrenteVerde ? <Badge tone="success">F. verde</Badge> : null}
                      {!un.esEsquina && !un.tieneFrenteVerde ? (
                        <span className="text-[var(--text)]/30">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/80">
                    {money(un.precio.base)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60">
                    {money(un.precio.excedente)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60">
                    {money(un.precio.esquina)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/60">
                    {money(un.precio.frenteVerde)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[var(--text)]">
                    {money(un.precio.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--bg)]/40 font-semibold">
                <td className="px-3 py-2.5 text-[var(--text)]" colSpan={8}>
                  Total ({result.totalDisponibles} unidades)
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--accent)]">
                  {formatCurrency(result.valorTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReporteShell>
  );
}
