'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: el effect siembra loading antes de disparar los fetch.
 * Mismo patrón que juntas, tasks y empleados (y /dilesa/terrenos). Mover a
 * Suspense-driven data exige refactor mayor — fuera del scope del sprint.
 */

/**
 * Módulo Anteproyectos — master page.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-anteproyectos). Tercer módulo
 * del backbone inmobiliario. Expone tabs Consulta / Resumen / Timeline /
 * Chart siguiendo la convención de flujo-maestro §6.
 *
 * Alcance:
 *   - Consulta: tabla master con identidad, terreno, tipo, KPIs físicos
 *     y cálculos derivados de v_anteproyectos_analisis.
 *   - Alta: Sheet lateral con campos mínimos. El expediente se completa
 *     desde /dilesa/anteproyectos/[id].
 *   - Resumen: totales por estado, utilidad proyectada, margen promedio,
 *     top 5 por utilidad, alertas de anteproyectos sin prototipos ref.
 *   - Timeline / Chart: placeholders para iteración futura.
 */

import { RequireAccess } from '@/components/require-access';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Plus, Search, RefreshCw, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { Form, FormActions, FormField, useZodForm } from '@/components/forms';
import {
  ANTEPROYECTO_ESTADO_CONFIG,
  PRIORIDAD_CONFIG,
  type AnteproyectoEstado,
  type PrioridadNivel,
} from '@/lib/status-tokens';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
  formatPercent,
} from '@/lib/dilesa-constants';
import { ModuleTabs, TabPanel, useActiveTab } from '@/components/shared/module-tabs';
import { EmptyStateImported } from '@/components/shared/empty-state-imported';

const AnteproyectoCreateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  terreno_id: z.string().min(1, 'El terreno es obligatorio'),
  tipo_proyecto_id: z.string().default(''),
  fecha_inicio: z.string().default(''),
  area_vendible_m2: z.string().default(''),
  areas_verdes_m2: z.string().default(''),
  cantidad_lotes: z.string().default(''),
  infraestructura_cabecera_inversion: z.string().default(''),
});

type AnteproyectoCreateValues = z.infer<typeof AnteproyectoCreateSchema>;

const anteproyectoCreateDefaults: AnteproyectoCreateValues = {
  nombre: '',
  terreno_id: '',
  tipo_proyecto_id: '',
  fecha_inicio: '',
  area_vendible_m2: '',
  areas_verdes_m2: '',
  cantidad_lotes: '',
  infraestructura_cabecera_inversion: '',
};

type TerrenoOption = {
  id: string;
  nombre: string;
  municipio: string | null;
};

type TipoProyectoOption = {
  id: string;
  nombre: string;
};

type Anteproyecto = {
  id: string;
  nombre: string;
  clave_interna: string | null;
  terreno_id: string;
  tipo_proyecto_id: string | null;
  fecha_inicio: string | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  cantidad_lotes: number | null;
  infraestructura_cabecera_inversion: number | null;
  estado: string;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  proyecto_id: string | null;
  created_at: string;
  updated_at: string;
  terreno: { nombre: string; municipio: string | null } | null;
  tipo_proyecto: { nombre: string } | null;
};

type Analisis = {
  id: string;
  aprovechamiento_pct: number | null;
  prototipos_referenciados: number | null;
  valor_comercial_proyecto: number | null;
  costo_total_proyecto: number | null;
  utilidad_proyecto: number | null;
  margen_pct: number | null;
};

type Row = Anteproyecto & {
  aprovechamiento_pct: number | null;
  prototipos_referenciados: number | null;
  valor_comercial_proyecto: number | null;
  costo_total_proyecto: number | null;
  utilidad_proyecto: number | null;
  margen_pct: number | null;
};

const ESTADO_KEYS = Object.keys(ANTEPROYECTO_ESTADO_CONFIG) as AnteproyectoEstado[];

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-[var(--text)]/35">—</span>;
  const cfg = ANTEPROYECTO_ESTADO_CONFIG[estado as AnteproyectoEstado];
  if (!cfg) return <Badge tone="neutral">{estado}</Badge>;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function PrioridadDot({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[var(--text)]/35">—</span>;
  const cfg = PRIORIDAD_CONFIG[prioridad as PrioridadNivel];
  if (!cfg) return <span className="text-[var(--text)]/55">{prioridad}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/75">
      <span className={`inline-block size-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function AnteproyectosInner() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const active = useActiveTab();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [terrenos, setTerrenos] = useState<TerrenoOption[]>([]);
  const [tiposProyecto, setTiposProyecto] = useState<TipoProyectoOption[]>([]);

  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const createForm = useZodForm({
    schema: AnteproyectoCreateSchema,
    defaultValues: anteproyectoCreateDefaults,
  });

  const fetchAll = useCallback(async () => {
    const [apRes, vRes, tRes, tpRes] = await Promise.all([
      supabase
        .schema('dilesa')
        .from('anteproyectos')
        .select('*, terreno:terreno_id(nombre, municipio), tipo_proyecto:tipo_proyecto_id(nombre)')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .schema('dilesa')
        .from('v_anteproyectos_analisis')
        .select(
          'id, aprovechamiento_pct, prototipos_referenciados, valor_comercial_proyecto, costo_total_proyecto, utilidad_proyecto, margen_pct'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID),
      supabase
        .schema('dilesa')
        .from('terrenos')
        .select('id, nombre, municipio')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre', { ascending: true }),
      supabase
        .schema('dilesa')
        .from('tipo_proyecto')
        .select('id, nombre')
        .is('deleted_at', null)
        .eq('activo', true)
        .order('orden', { ascending: true }),
    ]);

    if (apRes.error) {
      setError(apRes.error.message);
      return;
    }

    const analisisById = new Map<string, Analisis>();
    for (const r of (vRes.data ?? []) as Analisis[]) {
      analisisById.set(r.id, r);
    }

    const merged: Row[] = ((apRes.data ?? []) as unknown as Anteproyecto[]).map((ap) => {
      const a = analisisById.get(ap.id);
      return {
        ...ap,
        aprovechamiento_pct: a?.aprovechamiento_pct ?? null,
        prototipos_referenciados: a?.prototipos_referenciados ?? null,
        valor_comercial_proyecto: a?.valor_comercial_proyecto ?? null,
        costo_total_proyecto: a?.costo_total_proyecto ?? null,
        utilidad_proyecto: a?.utilidad_proyecto ?? null,
        margen_pct: a?.margen_pct ?? null,
      };
    });

    setRows(merged);
    setTerrenos((tRes.data ?? []) as TerrenoOption[]);
    setTiposProyecto((tpRes.data ?? []) as TipoProyectoOption[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await fetchAll();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchAll]);

  const openCreate = () => {
    createForm.reset(anteproyectoCreateDefaults);
    setShowCreate(true);
  };

  const handleCreate = async (values: AnteproyectoCreateValues) => {
    const { data: newRow, error: err } = await supabase
      .schema('dilesa')
      .from('anteproyectos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        nombre: values.nombre.trim(),
        terreno_id: values.terreno_id,
        tipo_proyecto_id: values.tipo_proyecto_id || null,
        fecha_inicio: values.fecha_inicio || null,
        area_vendible_m2: values.area_vendible_m2 ? Number(values.area_vendible_m2) : null,
        areas_verdes_m2: values.areas_verdes_m2 ? Number(values.areas_verdes_m2) : null,
        cantidad_lotes: values.cantidad_lotes ? Number(values.cantidad_lotes) : null,
        infraestructura_cabecera_inversion: values.infraestructura_cabecera_inversion
          ? Number(values.infraestructura_cabecera_inversion)
          : null,
        estado: 'en_analisis',
      })
      .select('id')
      .single();
    if (err) {
      alert(`Error al crear anteproyecto: ${err.message}`);
      return;
    }
    setShowCreate(false);
    await fetchAll();
    if (newRow?.id) {
      router.push(`/dilesa/anteproyectos/${newRow.id}`);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterEstado !== 'all' && r.estado !== filterEstado) return false;
      if (!s) return true;
      return (
        r.nombre.toLowerCase().includes(s) ||
        (r.clave_interna ?? '').toLowerCase().includes(s) ||
        (r.terreno?.nombre ?? '').toLowerCase().includes(s) ||
        (r.tipo_proyecto?.nombre ?? '').toLowerCase().includes(s)
      );
    });
  }, [rows, search, filterEstado]);

  const terrenoOptions: ComboboxOption[] = useMemo(
    () =>
      terrenos.map((t) => ({
        value: t.id,
        label: t.nombre,
        sub: t.municipio ?? undefined,
        searchLabel: `${t.nombre} ${t.municipio ?? ''}`.trim(),
      })),
    [terrenos]
  );

  const tipoProyectoOptions: ComboboxOption[] = useMemo(
    () => tiposProyecto.map((t) => ({ value: t.id, label: t.nombre, searchLabel: t.nombre })),
    [tiposProyecto]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            DILESA · Inmobiliario
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">
            Anteproyectos
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Evaluación y análisis financiero pre-proyecto. De aquí nacen los proyectos formales vía
            &ldquo;Convertir a Proyecto&rdquo;.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => fetchAll()} size="sm">
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button type="button" onClick={openCreate} size="sm">
            <Plus className="size-4" />
            Nuevo anteproyecto
          </Button>
        </div>
      </header>

      <ModuleTabs
        tabs={[
          { key: 'consulta', label: 'Consulta', badge: rows.length },
          { key: 'resumen', label: 'Resumen' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'chart', label: 'Chart' },
        ]}
      />

      <TabPanel tabKey="consulta" active={active}>
        <ConsultaPanel
          data={filtered}
          universeCount={rows.length}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          filterEstado={filterEstado}
          setFilterEstado={setFilterEstado}
          onOpenCreate={openCreate}
          onOpenDetail={(id) => router.push(`/dilesa/anteproyectos/${id}`)}
        />
      </TabPanel>

      <TabPanel tabKey="resumen" active={active}>
        <ResumenPanel rows={rows} loading={loading} />
      </TabPanel>

      <TabPanel tabKey="timeline" active={active}>
        <PlaceholderPanel
          title="Timeline"
          description="Cronología de cambios por anteproyecto: transiciones de estado, decisiones, referencias agregadas. Próximo sprint."
        />
      </TabPanel>

      <TabPanel tabKey="chart" active={active}>
        <PlaceholderPanel
          title="Chart"
          description="Distribución por estado, utilidad proyectada comparada, margen vs. tamaño. Próximo sprint."
        />
      </TabPanel>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="w-full max-w-xl">
          <SheetHeader>
            <SheetTitle>Nuevo anteproyecto</SheetTitle>
            <SheetDescription>
              Solo campos esenciales — el expediente y los prototipos de referencia se capturan
              desde el detalle.
            </SheetDescription>
          </SheetHeader>
          <Form form={createForm} onSubmit={handleCreate} className="mt-6 space-y-5">
            <FormField name="nombre" label="Nombre del anteproyecto" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  placeholder="Ej. Los Nogales Etapa 1"
                />
              )}
            </FormField>

            <FormField name="terreno_id" label="Terreno" required>
              {(field) => (
                <>
                  <Combobox
                    id={field.id}
                    value={field.value}
                    onChange={field.onChange}
                    options={terrenoOptions}
                    placeholder="Seleccionar terreno…"
                    searchPlaceholder="Buscar por nombre o municipio…"
                    emptyText="Sin terrenos disponibles"
                    allowClear
                  />
                  {terrenoOptions.length === 0 ? (
                    <p className="mt-1 text-xs text-[var(--text)]/55">
                      Aún no hay terrenos capturados. Crea uno en{' '}
                      <Link
                        href="/dilesa/terrenos"
                        className="text-[var(--accent)] hover:underline"
                      >
                        Terrenos
                      </Link>
                      .
                    </p>
                  ) : null}
                </>
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="tipo_proyecto_id" label="Tipo de proyecto">
                {(field) => (
                  <Combobox
                    id={field.id}
                    value={field.value}
                    onChange={field.onChange}
                    options={tipoProyectoOptions}
                    placeholder={
                      tipoProyectoOptions.length === 0 ? '(sin definir)' : 'Seleccionar…'
                    }
                    emptyText="Catálogo vacío"
                    allowClear
                  />
                )}
              </FormField>
              <FormField name="fecha_inicio" label="Fecha inicio">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="date"
                  />
                )}
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="area_vendible_m2" label="Área vendible (m²)">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                  />
                )}
              </FormField>
              <FormField name="areas_verdes_m2" label="Áreas verdes (m²)">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                  />
                )}
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="cantidad_lotes" label="Cantidad de lotes">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                  />
                )}
              </FormField>
              <FormField name="infraestructura_cabecera_inversion" label="Inversión cabecera">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                  />
                )}
              </FormField>
            </div>

            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Crear anteproyecto"
              submittingLabel="Creando..."
              submitIcon={<Plus className="size-4" />}
              onCancel={() => setShowCreate(false)}
              className="border-t-0 pt-2"
            />
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConsultaPanel(props: {
  data: Row[];
  universeCount: number;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filterEstado: string;
  setFilterEstado: (v: string) => void;
  onOpenCreate: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const {
    data,
    universeCount,
    loading,
    error,
    search,
    setSearch,
    filterEstado,
    setFilterEstado,
    onOpenCreate,
    onOpenDetail,
  } = props;

  const columns: Column<Row>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-[var(--text)]">{r.nombre}</span>
          {r.clave_interna ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/45">
              {r.clave_interna}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'terreno',
      label: 'Terreno',
      sortable: false,
      render: (r) => (
        <div className="flex min-w-0 flex-col text-xs">
          <span className="truncate text-[var(--text)]/80">{r.terreno?.nombre ?? '—'}</span>
          {r.terreno?.municipio ? (
            <span className="truncate text-[var(--text)]/45">{r.terreno.municipio}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'tipo_proyecto',
      label: 'Tipo',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/70',
      render: (r) => r.tipo_proyecto?.nombre ?? <span className="text-[var(--text)]/35">—</span>,
    },
    {
      key: 'cantidad_lotes',
      label: 'Lotes',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (r) => r.cantidad_lotes ?? '—',
    },
    {
      key: 'area_vendible_m2',
      label: 'Área vendible',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (r) => formatM2(r.area_vendible_m2),
    },
    {
      key: 'aprovechamiento_pct',
      label: 'Aprov. %',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (r) => formatPercent(r.aprovechamiento_pct),
    },
    {
      key: 'utilidad_proyecto',
      label: 'Utilidad',
      type: 'currency',
      render: (r) => (
        <span
          className={
            r.utilidad_proyecto != null && r.utilidad_proyecto < 0
              ? 'text-red-400'
              : 'text-[var(--text)]/75'
          }
        >
          {formatCurrency(r.utilidad_proyecto, { compact: true })}
        </span>
      ),
    },
    {
      key: 'margen_pct',
      label: 'Margen %',
      type: 'number',
      render: (r) => (
        <span
          className={
            r.margen_pct != null && r.margen_pct < 0 ? 'text-red-400' : 'text-[var(--text)]/75'
          }
        >
          {formatPercent(r.margen_pct)}
        </span>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      sortable: false,
      render: (r) => <EstadoBadge estado={r.estado} />,
    },
    {
      key: 'prioridad',
      label: 'Prioridad',
      sortable: false,
      render: (r) => <PrioridadDot prioridad={r.prioridad} />,
    },
    {
      key: 'fecha_ultima_revision',
      label: 'Última revisión',
      cellClassName: 'whitespace-nowrap text-xs text-[var(--text)]/60',
      render: (r) => formatDateShort(r.fecha_ultima_revision),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, clave, terreno, tipo…"
            className="pl-8"
          />
        </div>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados</option>
          {ESTADO_KEYS.map((k) => (
            <option key={k} value={k}>
              {ANTEPROYECTO_ESTADO_CONFIG[k].label}
            </option>
          ))}
        </select>
      </div>

      {universeCount === 0 && !loading && !error ? (
        <EmptyStateImported
          entityLabel="Anteproyectos"
          description="Crea el primer anteproyecto para evaluar un terreno. Necesitarás al menos un terreno capturado."
          onCreate={onOpenCreate}
        />
      ) : (
        <DataTable<Row>
          data={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          error={error}
          onRowClick={(r) => onOpenDetail(r.id)}
          initialSort={{ key: 'nombre', dir: 'asc' }}
          showDensityToggle={false}
          emptyTitle="Sin resultados"
          emptyDescription="Limpia los filtros para ver todos los anteproyectos."
        />
      )}
    </div>
  );
}

function ResumenPanel({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const kpis = useMemo(() => {
    const activos = rows.filter(
      (r) => r.estado !== 'convertido_a_proyecto' && r.estado !== 'no_viable'
    );
    const utilidadTotal = activos.reduce((acc, r) => acc + (r.utilidad_proyecto ?? 0), 0);
    const margenes = activos.map((r) => r.margen_pct).filter((m): m is number => m != null);
    const margenPromedio =
      margenes.length > 0 ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null;

    const porEstado = new Map<string, number>();
    rows.forEach((r) => {
      porEstado.set(r.estado, (porEstado.get(r.estado) ?? 0) + 1);
    });

    const top5 = [...activos]
      .filter((r) => r.utilidad_proyecto != null)
      .sort((a, b) => (b.utilidad_proyecto ?? 0) - (a.utilidad_proyecto ?? 0))
      .slice(0, 5);

    const sinPrototipos = activos.filter((r) => (r.prototipos_referenciados ?? 0) === 0);

    return {
      total: rows.length,
      activos: activos.length,
      utilidadTotal,
      margenPromedio,
      porEstado: Array.from(porEstado.entries()),
      top5,
      sinPrototipos,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Anteproyectos totales" value={kpis.total.toLocaleString('es-MX')} />
        <KpiCard label="Activos" value={kpis.activos.toLocaleString('es-MX')} />
        <KpiCard
          label="Utilidad proyectada (activos)"
          value={formatCurrency(kpis.utilidadTotal, { compact: true })}
        />
        <KpiCard label="Margen promedio (activos)" value={formatPercent(kpis.margenPromedio)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Distribución por estado
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.porEstado.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">(sin datos)</li>
            ) : (
              kpis.porEstado.map(([estado, count]) => (
                <li key={estado} className="flex items-center justify-between gap-3">
                  <EstadoBadge estado={estado} />
                  <span className="text-sm tabular-nums text-[var(--text)]/70">{count}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Top 5 por utilidad proyectada
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.top5.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">
                Agrega prototipos de referencia a los anteproyectos para ver proyecciones.
              </li>
            ) : (
              kpis.top5.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-[var(--text)]/80">{r.nombre}</span>
                  <span
                    className={`text-sm tabular-nums ${
                      (r.utilidad_proyecto ?? 0) < 0 ? 'text-red-400' : 'text-[var(--text)]/70'
                    }`}
                  >
                    {formatCurrency(r.utilidad_proyecto, { compact: true })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {kpis.sinPrototipos.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <AlertTriangle className="size-3.5" />
            Sin prototipos de referencia ({kpis.sinPrototipos.length})
          </h3>
          <p className="mt-1 text-xs text-[var(--text)]/55">
            Los anteproyectos sin prototipos referenciados no muestran utilidad proyectada ni
            margen. Agrega al menos uno desde el detalle.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {kpis.sinPrototipos.slice(0, 8).map((r) => (
              <li key={r.id} className="text-[var(--text)]/75">
                · {r.nombre}
              </li>
            ))}
            {kpis.sinPrototipos.length > 8 ? (
              <li className="text-[var(--text)]/45">…y {kpis.sinPrototipos.length - 8} más.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div>
    </div>
  );
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8 text-center">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text)]/55">{description}</p>
    </div>
  );
}

export default function AnteproyectosPage() {
  return (
    <RequireAccess empresa="dilesa">
      <Suspense fallback={<div className="p-6 text-sm text-[var(--text)]/55">Cargando…</div>}>
        <AnteproyectosInner />
      </Suspense>
    </RequireAccess>
  );
}
