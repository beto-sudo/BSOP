'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldAlert } from 'lucide-react';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ActiveFiltersChip, DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  alertLabel,
  auditarRecetas,
  fetchRecetas,
  type AlertSeverity,
  type AlertType,
  type RecetaAlert,
} from '@/lib/productos/recetas';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type AlertRow = RecetaAlert & { id: string };

const FILTER_DEFAULTS = {
  search: '',
  severidad: 'todas' as 'todas' | AlertSeverity,
  tipo: 'todos' as 'todos' | AlertType,
};

/**
 * @module Productos — Auditoría (RDB)
 * @responsive desktop-only
 */
export default function ProductosAuditoriaPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <DesktopOnlyNotice module="Auditoría" />
      <div className="hidden sm:block">
        <ProductosAuditoriaBody />
      </div>
    </RequireAccess>
  );
}

function ProductosAuditoriaBody() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<RecetaAlert[]>([]);
  const [recetasCount, setRecetasCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { filters, setFilter, clearAll } = useUrlFilters(FILTER_DEFAULTS);
  const search = filters.search;
  const severidadFiltro = filters.severidad;
  const tipoFiltro = filters.tipo;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const recetas = await fetchRecetas(supabase, RDB_EMPRESA_ID);
      const out = auditarRecetas(recetas);
      setAlerts(out);
      setRecetasCount(recetas.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    for (const a of alerts) {
      if (a.severity === 'critical') critical++;
      else warning++;
    }
    return { critical, warning, total: alerts.length };
  }, [alerts]);

  const filtered = useMemo<AlertRow[]>(() => {
    const q = search.trim().toLowerCase();
    const out: AlertRow[] = [];
    for (const a of alerts) {
      if (severidadFiltro !== 'todas' && a.severity !== severidadFiltro) continue;
      if (tipoFiltro !== 'todos' && a.type !== tipoFiltro) continue;
      if (q) {
        const inProd = a.receta.producto_venta_nombre.toLowerCase().includes(q);
        const inCat = (a.receta.categoria_nombre ?? '').toLowerCase().includes(q);
        const inDetalle = a.detalle.toLowerCase().includes(q);
        if (!inProd && !inCat && !inDetalle) continue;
      }
      out.push({ ...a, id: `${a.receta.producto_venta_id}:${a.type}` });
    }
    return out;
  }, [alerts, search, severidadFiltro, tipoFiltro]);

  const activeCount =
    (search.trim() ? 1 : 0) +
    (severidadFiltro !== 'todas' ? 1 : 0) +
    (tipoFiltro !== 'todos' ? 1 : 0);

  const columns = useMemo<Column<AlertRow>[]>(
    () => [
      {
        key: 'severity',
        label: 'Severidad',
        accessor: (row) => (row.severity === 'critical' ? 0 : 1),
        render: (row) =>
          row.severity === 'critical' ? (
            <Badge tone="danger">Crítico</Badge>
          ) : (
            <Badge tone="warning">Warning</Badge>
          ),
      },
      {
        key: 'producto',
        label: 'Receta',
        accessor: (row) => row.receta.producto_venta_nombre.toLowerCase(),
        render: (row) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.receta.producto_venta_nombre}</span>
            {row.receta.categoria_nombre ? (
              <span className="text-muted-foreground text-xs">{row.receta.categoria_nombre}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'tipo',
        label: 'Alerta',
        accessor: (row) => row.type,
        render: (row) => alertLabel(row.type),
      },
      {
        key: 'detalle',
        label: 'Detalle',
        accessor: (row) => row.detalle,
        render: (row) => <span className="text-muted-foreground text-xs">{row.detalle}</span>,
      },
    ],
    []
  );

  const goToReceta = useCallback(
    (row: AlertRow) => {
      router.push(`/rdb/productos/recetas?focus=${row.receta.producto_venta_id}`);
    },
    [router]
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text)]/60">
          Reporte de huecos en la configuración de recetas. Click en una alerta abre la receta
          correspondiente. Heurística &ldquo;producto sin receta esperada&rdquo; llega en sprint
          posterior.
        </p>
        <Button variant="outline" size="sm" onClick={() => void fetchData()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refrescar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<ShieldAlert className="h-5 w-5 text-red-600" />}
          label="Críticas"
          value={counts.critical}
          loading={loading}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          label="Warnings"
          value={counts.warning}
          loading={loading}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          label="Recetas auditadas"
          value={recetasCount}
          loading={loading}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar receta, categoría o detalle…"
            className="pl-8"
            aria-label="Buscar receta, categoría o detalle"
          />
        </div>
        <select
          value={severidadFiltro}
          onChange={(e) => setFilter('severidad', e.target.value as typeof severidadFiltro)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Filtrar por severidad"
        >
          <option value="todas">Todas las severidades</option>
          <option value="critical">Solo críticas</option>
          <option value="warning">Solo warnings</option>
        </select>
        <select
          value={tipoFiltro}
          onChange={(e) => setFilter('tipo', e.target.value as typeof tipoFiltro)}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Filtrar por tipo de alerta"
        >
          <option value="todos">Todos los tipos</option>
          <option value="margen_negativo">Margen negativo</option>
          <option value="insumo_huerfano">Insumo huérfano</option>
          <option value="insumo_sin_costo">Insumo sin costo</option>
          <option value="insumo_no_inventariable">Insumo no inventariable</option>
        </select>
        <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey="id"
        onRowClick={goToReceta}
        loading={loading}
        error={error}
        onRetry={() => void fetchData()}
        initialSort={{ key: 'severity', dir: 'asc' }}
        emptyTitle="Sin alertas pendientes"
        emptyDescription="Cuando hay margen negativo, insumos huérfanos, sin costo o no inventariables, aparecerán aquí."
        emptyIcon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex flex-col">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{loading ? '—' : value}</span>
      </div>
    </div>
  );
}
