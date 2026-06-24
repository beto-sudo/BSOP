'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. app/dilesa/ventas/fases/page.tsx).
 */

/**
 * Vista del reporte «Pipeline por fase» (DILESA · Ventas) — ADR-047.
 *
 * Fetch ligero y enfocado (ventas activas + catálogo de fases + proyectos +
 * vendedores), filtros proyecto/vendedor/mes en la URL, y el embudo derivado
 * por el motor puro `construirPipelinePorFase` — el mismo que alimenta el PDF.
 * El botón «Exportar PDF» (en el shell) lleva los filtros actuales como query
 * params para que el documento refleje exactamente lo que se ve.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip, type ModuleKpi } from '@/components/module-page';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatCurrency, formatPercent } from '@/lib/format';
import { getReporte } from '@/lib/dilesa/reportes/registry';
import {
  construirPipelinePorFase,
  filtrarVentas,
  type FaseCatalogo,
  type VentaReporte,
} from '@/lib/dilesa/reportes/pipeline-por-fase';
import { ReporteShell } from './reporte-shell';

const REPORTE = getReporte('pipeline-por-fase')!;
const VOLVER_HREF = '/dilesa/ventas/reportes';

type VentaRaw = {
  id: string;
  estado: string;
  fase_actual: string | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  unidad_id: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  created_at: string;
};

const DEFAULT_FILTERS = { proyecto: '', vendedor: '', mes: '' };

export function PipelinePorFaseView() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);

  const [fases, setFases] = useState<FaseCatalogo[]>([]);
  const [ventas, setVentas] = useState<VentaReporte[]>([]);
  const [proyectos, setProyectos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    const [fasesRes, ventasRes, unidadesRes, prjRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('venta_fase_catalogo')
        .select('posicion, nombre, rol')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('posicion', { ascending: true }),
      sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, estado, fase_actual, valor_escrituracion, valor_comercial, unidad_id, vendedor, vendedor_usuario_id, created_at'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, proyecto_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre', { ascending: true }),
    ]);

    const firstErr = fasesRes.error ?? ventasRes.error ?? unidadesRes.error ?? prjRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el reporte.'));
      setLoading(false);
      return;
    }

    const unidadProyecto = new Map<string, string | null>();
    for (const u of (unidadesRes.data ?? []) as Array<{ id: string; proyecto_id: string | null }>) {
      unidadProyecto.set(u.id, u.proyecto_id);
    }

    // Vendedor resuelto: FK a core.usuarios (ventas nuevas), fallback al
    // texto legacy (ventas migradas de Coda) — mismo criterio que ventas-module.
    const ventasRaw = (ventasRes.data ?? []) as VentaRaw[];
    const vendedorIds = [
      ...new Set(ventasRaw.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    const usuarioMap = new Map<string, string>();
    if (vendedorIds.length > 0) {
      const { data: usuarios } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);
      for (const u of usuarios ?? []) {
        const nombre = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        usuarioMap.set(u.id as string, nombre || ((u.email as string | null) ?? ''));
      }
    }

    setFases((fasesRes.data ?? []) as FaseCatalogo[]);
    setProyectos((prjRes.data ?? []) as Array<{ id: string; nombre: string }>);
    setVentas(
      ventasRaw.map((v) => ({
        estado: v.estado,
        fase_actual: v.fase_actual,
        precio: v.valor_escrituracion ?? v.valor_comercial,
        proyectoId: v.unidad_id ? (unidadProyecto.get(v.unidad_id) ?? null) : null,
        vendedor: v.vendedor_usuario_id
          ? (usuarioMap.get(v.vendedor_usuario_id) ?? v.vendedor)
          : v.vendedor,
        mes: v.created_at.slice(0, 7),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const vendedoresPresentes = useMemo(
    () =>
      [...new Set(ventas.map((v) => v.vendedor).filter((x): x is string => !!x))].sort((a, b) =>
        a.localeCompare(b, 'es')
      ),
    [ventas]
  );
  // Proyectos presentes en las ventas (no el catálogo completo): evita listar
  // proyectos sin ventas y los nombres duplicados del catálogo `dilesa.proyectos`
  // (cascarones de import). El value sigue siendo el id → el filtro por
  // `proyectoId` no cambia. Simétrico con `vendedoresPresentes`.
  const proyectosPresentes = useMemo(() => {
    const nombrePorId = new Map(proyectos.map((p) => [p.id, p.nombre]));
    const porId = new Map<string, string>();
    for (const v of ventas) {
      if (!v.proyectoId) continue;
      const nombre = nombrePorId.get(v.proyectoId);
      if (nombre) porId.set(v.proyectoId, nombre);
    }
    return [...porId.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [ventas, proyectos]);
  const mesesPresentes = useMemo(
    () => [...new Set(ventas.map((v) => v.mes))].sort().reverse(),
    [ventas]
  );

  const result = useMemo(() => {
    const filtradas = filtrarVentas(ventas, filters);
    return construirPipelinePorFase(fases, filtradas);
  }, [ventas, fases, filters]);

  const kpis = useMemo<readonly ModuleKpi[]>(() => {
    const conVentas = result.filas.filter((f) => f.ventas > 0).length;
    return [
      { key: 'ventas', label: 'Ventas en pipeline', value: result.totalVentas },
      {
        key: 'monto',
        label: 'Monto en pipeline',
        value: result.totalMonto === 0 ? '—' : formatCurrency(result.totalMonto, { compact: true }),
      },
      { key: 'cuello', label: 'Fase con más ventas', value: result.faseCuello ?? '—' },
      { key: 'cobertura', label: 'Fases con ventas', value: `${conVentas}/${result.filas.length}` },
    ];
  }, [result]);

  const pdfHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.proyecto) p.set('proyecto', filters.proyecto);
    if (filters.vendedor) p.set('vendedor', filters.vendedor);
    if (filters.mes) p.set('mes', filters.mes);
    const qs = p.toString();
    return `/api/dilesa/reportes/pipeline-por-fase/pdf${qs ? `?${qs}` : ''}`;
  }, [filters]);

  const maxVentas = useMemo(
    () => result.filas.reduce((max, f) => Math.max(max, f.ventas), 0),
    [result]
  );

  const filtros = (
    <>
      <select
        value={filters.proyecto}
        onChange={(e) => setFilter('proyecto', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Todos los proyectos</option>
        {proyectosPresentes.map((p) => (
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
        {vendedoresPresentes.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <select
        value={filters.mes}
        onChange={(e) => setFilter('mes', e.target.value)}
        className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
      >
        <option value="">Cualquier mes (creación)</option>
        {mesesPresentes.map((m) => (
          <option key={m} value={m}>
            {m}
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
        onClick={() => void cargar()}
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
            onClick={() => void cargar()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="w-10 px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Fase</th>
                <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Distribución</th>
                <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                <th className="px-3 py-2.5 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {result.filas.map((f) => (
                <tr
                  key={f.posicion}
                  className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--bg)]/30"
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-[var(--text)]/40">
                    {String(f.posicion).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--text)]">{f.fase}</div>
                    {f.rol ? (
                      <div className="text-[11px] text-[var(--text)]/45">{f.rol}</div>
                    ) : null}
                  </td>
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
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-[var(--text)]">Total pipeline</td>
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
