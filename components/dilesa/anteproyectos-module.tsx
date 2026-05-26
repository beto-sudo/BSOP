'use client';

/**
 * AnteproyectosModule — lista de anteproyectos DILESA.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 2. Anteproyectos
 * son rows en `dilesa.proyectos` con `tipo='anteproyecto'` (no una
 * tabla separada — el schema v2 los unificó con discriminador).
 *
 * Foco: evaluación de viabilidad. KPIs derivados del portafolio en
 * análisis. El checklist + presupuestos preliminares + conversión a
 * desarrollo son entregables de Sprints 3-4.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { ClipboardList, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatNumber } from '@/lib/format';
import { AnteproyectoDetailDrawer, deriveAnalisis } from './anteproyecto-detail-drawer';
import { type ProyectoDetalle, ESTADO_TONE, ESTADO_LABEL } from './proyecto-detail-drawer';

/** Estados que cuentan como "activos" (en pipeline de evaluación). */
const ESTADOS_ACTIVOS = new Set(['propuesta', 'analisis', 'aprobado']);

/**
 * KPIs reactivos a filtros — ADR-034.
 *
 * Curaduría D2 cerrada en planning doc. Los 5 KPIs originales eran
 * # activos / inversión proyectada / utilidad proyectada / margen / #
 * en decisión pendiente. Para v1 los KPIs 3 y 4 se reemplazan por
 * "Lotes proyectados" y "Área vendible" porque `dilesa.proyectos` no
 * tiene un campo directo de "valor de venta proyectado" del cual
 * derivar utilidad/margen sin asumir un precio promedio (pivote
 * documentado). Cuando se modele el ingreso proyectado en Sprint 3
 * (vía cotización de comercialización) o como columna derivada, se
 * reemplazan los KPIs 4 y 5 por los originales.
 *
 * KPIs:
 * 1. Total anteproyectos — `rows.length`.
 * 2. Activos — `count(estado IN propuesta|analisis|aprobado)`.
 * 3. Inversión proyectada — `SUM(presupuesto_estimado)`.
 * 4. Lotes proyectados — `SUM(lotes_proyectados)`.
 * 5. En decisión — `count(estado='analisis')`.
 */
export function deriveKpis(rows: readonly ProyectoDetalle[]): readonly ModuleKpi[] {
  const total = rows.length;
  const activos = rows.filter((p) => ESTADOS_ACTIVOS.has(p.estado)).length;
  const inversion = rows.reduce((acc, p) => acc + (p.presupuesto_estimado ?? 0), 0);
  const lotes = rows.reduce((acc, p) => acc + (p.lotes_proyectados ?? 0), 0);
  const enDecision = rows.filter((p) => p.estado === 'analisis').length;

  return [
    { key: 'total', label: 'Anteproyectos', value: total },
    { key: 'activos', label: 'Activos', value: activos },
    {
      key: 'inversion',
      label: 'Inversión proyectada',
      value: total === 0 ? '—' : formatCurrency(inversion, { compact: true }),
    },
    {
      key: 'lotes',
      label: 'Lotes proyectados',
      value: total === 0 ? '—' : formatNumber(lotes, { decimals: 0 }),
    },
    { key: 'en_decision', label: 'En decisión', value: enDecision },
  ];
}

export function AnteproyectosModule({ empresaId }: { empresaId: string }) {
  const [anteproyectos, setAnteproyectos] = useState<ProyectoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('');
  const [rangoInicio, setRangoInicio] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [selected, setSelected] = useState<ProyectoDetalle | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchAnteproyectos = useCallback(
    () =>
      createSupabaseBrowserClient()
        .schema('dilesa')
        .from('proyectos')
        .select(
          'id, tipo, nombre, estado, clave_interna, proyecto_padre_id, proyecto_predecesor_id, fecha_inicio, fecha_fin_estimada, fecha_licencia, area_m2, area_vendible_m2, areas_verdes_m2, lotes_proyectados, presupuesto_estimado, costo_terreno, costo_urbanizacion, costo_construccion, costo_comercializacion, notas'
        )
        .eq('empresa_id', empresaId)
        .eq('tipo', 'anteproyecto')
        .is('deleted_at', null)
        .order('nombre'),
    [empresaId]
  );

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchAnteproyectos();
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los anteproyectos.'));
      setAnteproyectos([]);
    } else {
      setAnteproyectos((data ?? []) as ProyectoDetalle[]);
    }
    setLoading(false);
  }, [fetchAnteproyectos]);

  useEffect(() => {
    let activo = true;
    void fetchAnteproyectos().then(({ data, error: err }) => {
      if (!activo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los anteproyectos.'));
        setAnteproyectos([]);
      } else {
        setAnteproyectos((data ?? []) as ProyectoDetalle[]);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchAnteproyectos]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return anteproyectos.filter((p) => {
      if (estadoFiltro && p.estado !== estadoFiltro) return false;
      if (!isInDateRange(p.fecha_inicio, rangoInicio)) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [anteproyectos, search, estadoFiltro, rangoInicio]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<ProyectoDetalle>[] = [
    { key: 'nombre', label: 'Nombre', type: 'text', sticky: true, width: 'min-w-[240px]' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (p) => (
        <Badge tone={ESTADO_TONE[p.estado] ?? 'neutral'}>
          {ESTADO_LABEL[p.estado] ?? p.estado}
        </Badge>
      ),
    },
    {
      key: 'clave_interna',
      label: 'Clave',
      type: 'text',
      render: (p) => p.clave_interna ?? <span className="text-[var(--text)]/30">—</span>,
    },
    { key: 'fecha_inicio', label: 'Inicio', type: 'date' },
    {
      key: 'lotes_proyectados',
      label: 'Lotes',
      type: 'number',
      render: (p) => (p.lotes_proyectados != null ? String(p.lotes_proyectados) : '—'),
    },
    {
      key: 'area_vendible_m2',
      label: 'Área vendible m²',
      type: 'number',
      render: (p) =>
        p.area_vendible_m2 != null ? (
          formatNumber(p.area_vendible_m2)
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        ),
    },
    { key: 'presupuesto_estimado', label: 'Presupuesto', type: 'currency' },
    {
      key: 'costo_total',
      label: 'Costo total',
      type: 'custom',
      accessor: (p) => deriveAnalisis(p).costoTotal ?? 0,
      render: (p) => {
        const total = deriveAnalisis(p).costoTotal;
        return total != null ? (
          formatCurrency(total)
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        );
      },
    },
    {
      key: 'costo_por_lote',
      label: 'Costo / lote',
      type: 'custom',
      accessor: (p) => deriveAnalisis(p).costoPorLote ?? 0,
      render: (p) => {
        const v = deriveAnalisis(p).costoPorLote;
        return v != null ? formatCurrency(v) : <span className="text-[var(--text)]/30">—</span>;
      },
    },
  ];

  const estadosPresentes = useMemo(
    () => Array.from(new Set(anteproyectos.map((p) => p.estado))).sort(),
    [anteproyectos]
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Anteproyectos
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Evaluación de viabilidad antes del arranque formal como desarrollo.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los estados</option>
          {estadosPresentes.map((s) => (
            <option key={s} value={s}>
              {ESTADO_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <DateRangeFilter
          label="Inicio"
          ariaPrefix="Fecha inicio"
          value={rangoInicio}
          onChange={setRangoInicio}
        />
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(p) => {
          setSelected(p);
          setDrawerOpen(true);
        }}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin anteproyectos"
        emptyDescription="Aún no hay anteproyectos en evaluación. Cuando se promuevan a desarrollos cambiarán de tab."
        emptyIcon={<ClipboardList className="h-6 w-6" />}
      />

      <AnteproyectoDetailDrawer
        anteproyecto={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
