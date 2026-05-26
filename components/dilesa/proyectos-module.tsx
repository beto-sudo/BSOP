'use client';

/**
 * ProyectosModule — lista de proyectos DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4. Lectura del schema
 * `dilesa` v2: tabla `proyectos` (master). v0 = lista + filtros; el detalle
 * (sub-proyectos, activos input/output, modelo financiero) y la captura son
 * entregables posteriores.
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
import { Landmark, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  ProyectoDetailDrawer,
  type ProyectoDetalle,
  TIPO_LABEL,
  ESTADO_TONE,
  ESTADO_LABEL,
} from './proyecto-detail-drawer';

/**
 * KPIs reactivos a filtros — ADR-034.
 *
 * Pivote D13 vs curaduría Sprint 0: "% completado promedio" no aplica
 * porque `dilesa.proyectos` no tiene campo de avance. "Próximo hito por
 * proyecto" es por-proyecto, no agregado. Reemplazados por KPIs sobre
 * agregados del portafolio que sí mueven decisión.
 *
 * Estados de proyecto (CHECK constraint): propuesta | analisis |
 * aprobado | ejecutando | completado | archivado.
 *
 * KPIs:
 * 1. Total proyectos — `rows.length`.
 * 2. En ejecución — `count(estado='ejecutando')` (los que consumen
 *    recursos hoy).
 * 3. Presupuesto total — `SUM(presupuesto_estimado)` (capital
 *    comprometido en el portafolio filtrado).
 * 4. Lotes proyectados — `SUM(lotes_proyectados)` (inventario futuro).
 * 5. Área vendible — `SUM(area_vendible_m2)` en m² o ha.
 */
export function deriveKpis(rows: readonly ProyectoDetalle[]): readonly ModuleKpi[] {
  const total = rows.length;
  const enEjecucion = rows.filter((p) => p.estado === 'ejecutando').length;
  const presupuesto = rows.reduce((acc, p) => acc + (p.presupuesto_estimado ?? 0), 0);
  const lotes = rows.reduce((acc, p) => acc + (p.lotes_proyectados ?? 0), 0);
  const areaM2 = rows.reduce((acc, p) => acc + (p.area_vendible_m2 ?? 0), 0);

  return [
    { key: 'total', label: 'Proyectos', value: total },
    { key: 'ejecutando', label: 'En ejecución', value: enEjecucion },
    {
      key: 'presupuesto',
      label: 'Presupuesto total',
      value: total === 0 ? '—' : formatCurrency(presupuesto, { compact: true }),
    },
    {
      key: 'lotes',
      label: 'Lotes proyectados',
      value: total === 0 ? '—' : formatNumber(lotes, { decimals: 0 }),
    },
    {
      key: 'area',
      label: 'Área vendible',
      value:
        total === 0
          ? '—'
          : areaM2 >= 10_000
            ? `${formatNumber(areaM2 / 10_000, { decimals: 1 })} ha`
            : `${formatNumber(areaM2, { decimals: 0 })} m²`,
    },
  ];
}

const EMPTY_TIPOS: readonly string[] = [];

/**
 * Props del módulo.
 *
 * - `excluirTipos` permite filtrar tipos específicos en el query base.
 *   Caso de uso: la tab "Activos" del hub Proyectos
 *   (`/dilesa/proyectos`) pasa `['anteproyecto']` para que los
 *   anteproyectos vivan solo en su tab hermana (iniciativa
 *   `dilesa-proyectos-anteproyectos` Sprint 2). Default vacío preserva
 *   el comportamiento histórico (todos los tipos).
 */
export function ProyectosModule({
  empresaId,
  excluirTipos = EMPTY_TIPOS,
}: {
  empresaId: string;
  excluirTipos?: readonly string[];
}) {
  const [proyectos, setProyectos] = useState<ProyectoDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('');
  const [rangoInicio, setRangoInicio] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [selected, setSelected] = useState<ProyectoDetalle | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchProyectos = useCallback(() => {
    let q = createSupabaseBrowserClient()
      .schema('dilesa')
      .from('proyectos')
      .select(
        'id, tipo, nombre, estado, clave_interna, proyecto_padre_id, proyecto_predecesor_id, fecha_inicio, fecha_fin_estimada, fecha_licencia, area_m2, area_vendible_m2, areas_verdes_m2, lotes_proyectados, presupuesto_estimado, costo_terreno, costo_urbanizacion, costo_construccion, costo_comercializacion, notas'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
    if (excluirTipos.length > 0) {
      // PostgREST: usar `not.in` con lista entre paréntesis. Valores
      // sin comillas porque `tipo` es text sin caracteres especiales.
      q = q.not('tipo', 'in', `(${excluirTipos.join(',')})`);
    }
    return q.order('nombre');
  }, [empresaId, excluirTipos]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchProyectos();
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los proyectos.'));
      setProyectos([]);
    } else {
      setProyectos((data ?? []) as ProyectoDetalle[]);
    }
    setLoading(false);
  }, [fetchProyectos]);

  // La carga inicial no llama cargar() directo: los setState van después del
  // await para no dispararlos síncronamente dentro del effect.
  useEffect(() => {
    let activo = true;
    void fetchProyectos().then(({ data, error: err }) => {
      if (!activo) return;
      if (err) {
        setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los proyectos.'));
        setProyectos([]);
      } else {
        setProyectos((data ?? []) as ProyectoDetalle[]);
      }
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchProyectos]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (tipoFiltro && p.tipo !== tipoFiltro) return false;
      if (!isInDateRange(p.fecha_inicio, rangoInicio)) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [proyectos, search, tipoFiltro, rangoInicio]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<ProyectoDetalle>[] = [
    { key: 'nombre', label: 'Nombre', type: 'text', sticky: true, width: 'min-w-[220px]' },
    {
      key: 'clave_interna',
      label: 'Clave',
      type: 'text',
      render: (p) => p.clave_interna ?? <span className="text-[var(--text)]/30">—</span>,
    },
    {
      key: 'tipo',
      label: 'Tipo',
      type: 'custom',
      render: (p) => <Badge tone="neutral">{TIPO_LABEL[p.tipo] ?? p.tipo}</Badge>,
    },
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
    { key: 'fecha_inicio', label: 'Inicio', type: 'date' },
    { key: 'fecha_fin_estimada', label: 'Fin estimado', type: 'date' },
    {
      key: 'fecha_licencia',
      label: 'Licencia',
      type: 'custom',
      accessor: (p) => p.fecha_licencia ?? '',
      render: (p) =>
        p.fecha_licencia ? (
          new Date(p.fecha_licencia).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        ),
    },
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
    { key: 'costo_terreno', label: 'Costo terreno', type: 'currency' },
    { key: 'costo_urbanizacion', label: 'Costo urb.', type: 'currency' },
    { key: 'costo_construccion', label: 'Costo const.', type: 'currency' },
    { key: 'costo_comercializacion', label: 'Costo com.', type: 'currency' },
  ];

  const tiposPresentes = useMemo(
    () => Array.from(new Set(proyectos.map((p) => p.tipo))).sort(),
    [proyectos]
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Proyectos</h1>
          <p className="text-sm text-[var(--text)]/60">
            Proyectos de desarrollo e intervención sobre los activos del portafolio.
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
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los tipos</option>
          {tiposPresentes.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t] ?? t}
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
        emptyTitle="Sin proyectos"
        emptyDescription="Aún no hay proyectos. Se llenará al importar los datos de Coda."
        emptyIcon={<Landmark className="h-6 w-6" />}
      />

      <ProyectoDetailDrawer proyecto={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
