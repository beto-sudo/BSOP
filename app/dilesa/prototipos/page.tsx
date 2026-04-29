'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: the effect seeds loading state before firing an async
 * fetch. Flagged by the hook-rule sweep but matches the convention used en
 * terrenos y resto del panel. Refactor a Suspense-driven queda fuera de scope.
 */

/**
 * Módulo Prototipos — master page.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-prototipos). Catálogo maestro de
 * productos habitacionales. Cada prototipo define dimensiones base, valor
 * comercial, y los 6 costos unitarios cuya suma es costo_total_unitario
 * (GENERATED en DB — no se setea en Insert).
 *
 * Alcance del scaffold:
 *   - Consulta: tabla master con identidad + dimensiones + económica +
 *     gestión; search + filtro por etapa.
 *   - Alta: Sheet lateral con identidad, dimensiones, valor y 6 costos.
 *   - Resumen: KPIs de activos, margen promedio por clasificación, top 5
 *     por valor comercial, alertas de documentos faltantes.
 *   - Timeline / Chart: placeholders.
 *
 * Schema: supabase/SCHEMA_REF.md §dilesa.prototipos.
 */

import { RequireAccess } from '@/components/require-access';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, ImageOff, FileWarning } from 'lucide-react';
import { z } from 'zod';
import { Form, FormActions, FormField, useZodForm } from '@/components/forms';
import {
  PROTOTIPO_ETAPA_CONFIG,
  PROTOTIPO_ETAPA_OPTIONS,
  PRIORIDAD_CONFIG,
  type PrototipoEtapa,
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

const PrototipoCreateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  codigo: z.string().default(''),
  superficie_construida_m2: z.string().default(''),
  superficie_lote_min_m2: z.string().default(''),
  recamaras: z.string().default(''),
  banos: z.string().default(''),
  valor_comercial: z.string().default(''),
  costo_urbanizacion: z.string().default(''),
  costo_materiales: z.string().default(''),
  costo_mano_obra: z.string().default(''),
  costo_registro_ruv: z.string().default(''),
  seguro_calidad: z.string().default(''),
  costo_comercializacion: z.string().default(''),
});

type PrototipoCreateValues = z.infer<typeof PrototipoCreateSchema>;

const prototipoCreateDefaults: PrototipoCreateValues = {
  nombre: '',
  codigo: '',
  superficie_construida_m2: '',
  superficie_lote_min_m2: '',
  recamaras: '',
  banos: '',
  valor_comercial: '',
  costo_urbanizacion: '',
  costo_materiales: '',
  costo_mano_obra: '',
  costo_registro_ruv: '',
  seguro_calidad: '',
  costo_comercializacion: '',
};

type Prototipo = {
  id: string;
  nombre: string;
  codigo: string | null;
  clasificacion_inmobiliaria_id: string | null;
  clasificacion_inmobiliaria: { nombre: string } | null;
  superficie_construida_m2: number | null;
  superficie_lote_min_m2: number | null;
  recamaras: number | null;
  banos: number | null;
  valor_comercial: number | null;
  costo_urbanizacion: number | null;
  costo_materiales: number | null;
  costo_mano_obra: number | null;
  costo_registro_ruv: number | null;
  seguro_calidad: number | null;
  costo_comercializacion: number | null;
  costo_total_unitario: number | null;
  imagen_principal_url: string | null;
  plano_arquitectonico_url: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  created_at: string;
  updated_at: string;
};

function EtapaBadge({ etapa }: { etapa: string | null }) {
  if (!etapa) return <span className="text-[var(--text)]/35">—</span>;
  const key = etapa as PrototipoEtapa;
  const cfg = PROTOTIPO_ETAPA_CONFIG[key];
  if (!cfg) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text)]/55">
        {etapa}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function PrioridadDot({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[var(--text)]/35">—</span>;
  const key = prioridad as PrioridadNivel;
  const cfg = PRIORIDAD_CONFIG[key];
  if (!cfg) return <span className="text-[var(--text)]/55">{prioridad}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/75">
      <span className={`inline-block size-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function PrototiposInner() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const active = useActiveTab();

  const [prototipos, setPrototipos] = useState<Prototipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterEtapa, setFilterEtapa] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const createForm = useZodForm({
    schema: PrototipoCreateSchema,
    defaultValues: prototipoCreateDefaults,
  });

  const fetchPrototipos = useCallback(async () => {
    // Embed clasificacion_inmobiliaria vía FK — PostgREST resuelve la relación
    // automáticamente (hay una sola FK entre prototipos y la tabla). El
    // catálogo puede estar vacío; la UI maneja el null gracefully.
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .select('*, clasificacion_inmobiliaria(nombre)')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setPrototipos((data ?? []) as unknown as Prototipo[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await fetchPrototipos();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchPrototipos]);

  const openCreate = () => {
    createForm.reset(prototipoCreateDefaults);
    setShowCreate(true);
  };

  const parseNum = (v: string) => (v.trim() ? Number(v) : null);

  const handleCreate = async (values: PrototipoCreateValues) => {
    // costo_total_unitario NO se envía en Insert — es GENERATED en DB.
    const { data: newRow, error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        nombre: values.nombre.trim(),
        codigo: values.codigo.trim() || null,
        superficie_construida_m2: parseNum(values.superficie_construida_m2),
        superficie_lote_min_m2: parseNum(values.superficie_lote_min_m2),
        recamaras: values.recamaras.trim() ? Number.parseInt(values.recamaras, 10) : null,
        banos: parseNum(values.banos),
        valor_comercial: parseNum(values.valor_comercial),
        costo_urbanizacion: parseNum(values.costo_urbanizacion),
        costo_materiales: parseNum(values.costo_materiales),
        costo_mano_obra: parseNum(values.costo_mano_obra),
        costo_registro_ruv: parseNum(values.costo_registro_ruv),
        seguro_calidad: parseNum(values.seguro_calidad),
        costo_comercializacion: parseNum(values.costo_comercializacion),
      })
      .select('id')
      .single();
    if (err) {
      alert(`Error al crear prototipo: ${err.message}`);
      return;
    }
    setShowCreate(false);
    await fetchPrototipos();
    if (newRow?.id) {
      router.push(`/dilesa/prototipos/${newRow.id}`);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return prototipos.filter((p) => {
      if (filterEtapa !== 'all' && p.etapa !== filterEtapa) return false;
      if (!s) return true;
      return (
        p.nombre.toLowerCase().includes(s) ||
        (p.codigo ?? '').toLowerCase().includes(s) ||
        (p.clasificacion_inmobiliaria?.nombre ?? '').toLowerCase().includes(s)
      );
    });
  }, [prototipos, search, filterEtapa]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            DILESA · Inmobiliario
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">
            Prototipos
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Catálogo maestro de productos habitacionales: dimensiones, valor comercial y costos
            unitarios por vivienda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => fetchPrototipos()} size="sm">
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button type="button" onClick={openCreate} size="sm">
            <Plus className="size-4" />
            Nuevo prototipo
          </Button>
        </div>
      </header>

      <ModuleTabs
        tabs={[
          { key: 'consulta', label: 'Consulta', badge: prototipos.length },
          { key: 'resumen', label: 'Resumen' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'chart', label: 'Chart' },
        ]}
      />

      <TabPanel tabKey="consulta" active={active}>
        <ConsultaPanel
          data={filtered}
          universeCount={prototipos.length}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          filterEtapa={filterEtapa}
          setFilterEtapa={setFilterEtapa}
          onOpenCreate={openCreate}
          onOpenDetail={(id) => router.push(`/dilesa/prototipos/${id}`)}
        />
      </TabPanel>

      <TabPanel tabKey="resumen" active={active}>
        <ResumenPanel prototipos={prototipos} loading={loading} />
      </TabPanel>

      <TabPanel tabKey="timeline" active={active}>
        <PlaceholderPanel
          title="Timeline"
          description="Cronología de cambios por prototipo (valor comercial, costos, etapa). Se implementa cuando prototipos_updates esté disponible. Por ahora el detalle muestra created_at / updated_at."
        />
      </TabPanel>

      <TabPanel tabKey="chart" active={active}>
        <PlaceholderPanel
          title="Chart"
          description="Distribución de margen por clasificación, evolución histórica de valor comercial vs costo. Próximo sprint."
        />
      </TabPanel>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo prototipo</SheetTitle>
            <SheetDescription>
              Captura identidad, dimensiones, valor comercial y los 6 costos unitarios. El costo
              total se calcula solo (GENERATED).
            </SheetDescription>
          </SheetHeader>
          <Form form={createForm} onSubmit={handleCreate} className="mt-6 space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Identidad
              </h3>
              <FormField name="nombre" label="Nombre" required>
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    placeholder="Ej. Modelo Nogal 72"
                  />
                )}
              </FormField>
              <FormField name="codigo" label="Código">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    placeholder="Ej. NGL-72"
                  />
                )}
              </FormField>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Dimensiones
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="superficie_construida_m2" label="Superficie construida (m²)">
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
                <FormField name="superficie_lote_min_m2" label="Lote mínimo (m²)">
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
                <FormField name="recamaras" label="Recámaras">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      aria-invalid={field.invalid || undefined}
                      aria-describedby={field.describedBy}
                      type="number"
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  )}
                </FormField>
                <FormField name="banos" label="Baños">
                  {(field) => (
                    <Input
                      {...field}
                      id={field.id}
                      aria-invalid={field.invalid || undefined}
                      aria-describedby={field.describedBy}
                      type="number"
                      step="0.5"
                      inputMode="decimal"
                      placeholder="0"
                    />
                  )}
                </FormField>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Económica
              </h3>
              <FormField name="valor_comercial" label="Valor comercial">
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="costo_urbanizacion" label="Costo urbanización">
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
                <FormField name="costo_materiales" label="Costo materiales">
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
                <FormField name="costo_mano_obra" label="Costo mano de obra">
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
                <FormField name="costo_registro_ruv" label="Registro RUV">
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
                <FormField name="seguro_calidad" label="Seguro de calidad">
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
                <FormField name="costo_comercializacion" label="Comercialización">
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
            </section>

            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Crear prototipo"
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
  data: Prototipo[];
  universeCount: number;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filterEtapa: string;
  setFilterEtapa: (v: string) => void;
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
    filterEtapa,
    setFilterEtapa,
    onOpenCreate,
    onOpenDetail,
  } = props;

  const columns: Column<Prototipo>[] = [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-[var(--text)]">{p.nombre}</span>
          {p.codigo ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/45">
              {p.codigo}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'clasificacion_inmobiliaria',
      label: 'Clasificación',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/70',
      render: (p) =>
        p.clasificacion_inmobiliaria?.nombre ?? (
          <span className="text-[var(--text)]/40">(sin clasificar)</span>
        ),
    },
    {
      key: 'superficie_construida_m2',
      label: 'Sup. construida',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => formatM2(p.superficie_construida_m2),
    },
    {
      key: 'recamaras',
      label: 'Rec.',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => p.recamaras ?? '—',
    },
    {
      key: 'banos',
      label: 'Baños',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => p.banos ?? '—',
    },
    {
      key: 'valor_comercial',
      label: 'Valor comercial',
      type: 'currency',
      cellClassName: 'text-xs font-medium text-[var(--text)]',
      render: (p) => formatCurrency(p.valor_comercial),
    },
    {
      key: 'costo_total_unitario',
      label: 'Costo total',
      type: 'currency',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => formatCurrency(p.costo_total_unitario),
    },
    {
      key: 'margen',
      label: 'Margen',
      type: 'currency',
      sortable: false,
      accessor: (p) =>
        p.valor_comercial != null && p.costo_total_unitario != null
          ? p.valor_comercial - p.costo_total_unitario
          : null,
      render: (p) => {
        const margen =
          p.valor_comercial != null && p.costo_total_unitario != null
            ? p.valor_comercial - p.costo_total_unitario
            : null;
        return (
          <span
            className={
              margen != null && margen < 0 ? 'font-semibold text-red-400' : 'text-[var(--text)]/75'
            }
          >
            {margen != null ? formatCurrency(margen) : '—'}
          </span>
        );
      },
    },
    {
      key: 'etapa',
      label: 'Etapa',
      sortable: false,
      render: (p) => <EtapaBadge etapa={p.etapa} />,
    },
    {
      key: 'prioridad',
      label: 'Prioridad',
      sortable: false,
      render: (p) => <PrioridadDot prioridad={p.prioridad} />,
    },
    {
      key: 'responsable_id',
      label: 'Responsable',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/60',
      render: (p) =>
        p.responsable_id ? (
          <span className="font-mono text-[10px]">{p.responsable_id.slice(0, 8)}…</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'fecha_ultima_revision',
      label: 'Última revisión',
      cellClassName: 'whitespace-nowrap text-xs text-[var(--text)]/60',
      render: (p) => formatDateShort(p.fecha_ultima_revision),
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
            placeholder="Buscar nombre, código, clasificación…"
            className="pl-8"
          />
        </div>
        <select
          value={filterEtapa}
          onChange={(e) => setFilterEtapa(e.target.value)}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
          aria-label="Filtrar por etapa"
        >
          <option value="all">Todas las etapas</option>
          {PROTOTIPO_ETAPA_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {PROTOTIPO_ETAPA_CONFIG[o].label}
            </option>
          ))}
        </select>
      </div>

      {universeCount === 0 && !loading && !error ? (
        <EmptyStateImported
          entityLabel="Prototipos"
          description="Captura el primer prototipo para arrancar el catálogo o importa desde Coda cuando esté disponible."
          onCreate={onOpenCreate}
        />
      ) : (
        <DataTable<Prototipo>
          data={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          error={error}
          onRowClick={(p) => onOpenDetail(p.id)}
          initialSort={{ key: 'nombre', dir: 'asc' }}
          showDensityToggle={false}
          emptyTitle="Sin resultados"
          emptyDescription="Limpia los filtros para ver todos los prototipos."
        />
      )}
    </div>
  );
}

function ResumenPanel({ prototipos, loading }: { prototipos: Prototipo[]; loading: boolean }) {
  const kpis = useMemo(() => {
    const activos = prototipos.filter((p) => p.etapa === 'activo');
    const conMargen = prototipos.filter(
      (p) => p.valor_comercial != null && p.costo_total_unitario != null
    );

    // Margen promedio por clasificación (incluye "sin_clasificar" agrupado).
    const byClas = new Map<string, { total: number; count: number }>();
    conMargen.forEach((p) => {
      const key = p.clasificacion_inmobiliaria?.nombre ?? '(sin clasificar)';
      const margen = (p.valor_comercial ?? 0) - (p.costo_total_unitario ?? 0);
      const denom = p.valor_comercial ?? 0;
      const pct = denom > 0 ? margen / denom : 0;
      const prev = byClas.get(key) ?? { total: 0, count: 0 };
      byClas.set(key, { total: prev.total + pct, count: prev.count + 1 });
    });
    const margenPorClas = Array.from(byClas.entries())
      .map(([k, v]) => ({ clasificacion: k, margenPromedio: v.total / v.count, n: v.count }))
      .sort((a, b) => b.margenPromedio - a.margenPromedio);

    const top5 = [...prototipos]
      .filter((p) => p.valor_comercial != null)
      .sort((a, b) => (b.valor_comercial ?? 0) - (a.valor_comercial ?? 0))
      .slice(0, 5);

    const sinImagen = prototipos.filter((p) => !p.imagen_principal_url).length;
    const sinPlano = prototipos.filter((p) => !p.plano_arquitectonico_url).length;

    return {
      total: prototipos.length,
      activos: activos.length,
      margenPorClas,
      top5,
      sinImagen,
      sinPlano,
    };
  }, [prototipos]);

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
        <KpiCard label="Prototipos totales" value={kpis.total.toLocaleString('es-MX')} />
        <KpiCard label="Activos" value={kpis.activos.toLocaleString('es-MX')} />
        <KpiCard label="Sin imagen principal" value={kpis.sinImagen.toLocaleString('es-MX')} />
        <KpiCard label="Sin plano arquitectónico" value={kpis.sinPlano.toLocaleString('es-MX')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Margen promedio por clasificación
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.margenPorClas.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">
                Aún no hay prototipos con valor + costos capturados.
              </li>
            ) : (
              kpis.margenPorClas.map((row) => (
                <li
                  key={row.clasificacion}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-[var(--text)]/75">
                    {row.clasificacion}
                    <span className="ml-2 text-[10px] text-[var(--text)]/40">n={row.n}</span>
                  </span>
                  <span
                    className={`tabular-nums ${
                      row.margenPromedio < 0 ? 'text-red-400' : 'text-[var(--text)]'
                    }`}
                  >
                    {formatPercent(row.margenPromedio)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Top 5 por valor comercial
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.top5.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">Sin valor comercial capturado.</li>
            ) : (
              kpis.top5.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--text)]/75">{p.nombre}</span>
                  <span className="tabular-nums text-[var(--text)]">
                    {formatCurrency(p.valor_comercial, { compact: true })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {kpis.sinImagen > 0 || kpis.sinPlano > 0 ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            <FileWarning className="size-3.5" />
            Documentos faltantes
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-[var(--text)]/75">
            {kpis.sinImagen > 0 ? (
              <li className="flex items-center gap-2">
                <ImageOff className="size-3.5 text-[var(--text)]/40" />
                {kpis.sinImagen} prototipo{kpis.sinImagen === 1 ? '' : 's'} sin imagen principal
              </li>
            ) : null}
            {kpis.sinPlano > 0 ? (
              <li className="flex items-center gap-2">
                <FileWarning className="size-3.5 text-[var(--text)]/40" />
                {kpis.sinPlano} prototipo{kpis.sinPlano === 1 ? '' : 's'} sin plano arquitectónico
              </li>
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

export default function PrototiposPage() {
  return (
    <RequireAccess empresa="dilesa">
      <Suspense fallback={<div className="p-6 text-sm text-[var(--text)]/55">Cargando…</div>}>
        <PrototiposInner />
      </Suspense>
    </RequireAccess>
  );
}
