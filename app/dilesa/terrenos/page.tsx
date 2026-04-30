'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: the effect seeds loading state before firing an async
 * fetch. Flagged by the hook-rule sweep but matches the convention used in
 * the rest of the BSOP app (juntas, tasks, empleados). Refactoring to
 * Suspense-driven data requires a wider change — out of scope for scaffold.
 */

/**
 * Módulo Terrenos — master page.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-terrenos). Primer módulo del
 * backbone inmobiliario en BSOP. Expone tabs Consulta / Resumen / Timeline /
 * Chart siguiendo la convención de flujo-maestro §6.
 *
 * Alcance del scaffold:
 *   - Consulta: tabla master con columnas A→H (identidad, ubicación,
 *     económica, gestión, cálculos), search y click-to-detail.
 *   - Alta: Sheet lateral con campos mínimos de captura. El resto del
 *     expediente se completa desde el detail page.
 *   - Resumen / Timeline / Chart: placeholders con TODO markers para
 *     iterar en siguientes sesiones sin romper navegación.
 *
 * Columnas definitivas: /mnt/DILESA/knowledge/modules/terrenos-columnas-definitivas.md
 * Schema: supabase/SCHEMA_REF.md §Schema dilesa / dilesa.terrenos
 */

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Plus, Search, RefreshCw, MapPin } from 'lucide-react';
import { z } from 'zod';
import { Form, FormActions, FormField, useZodForm } from '@/components/forms';
import {
  TERRENO_ETAPA_CONFIG,
  TERRENO_ETAPA_OPTIONS,
  TERRENO_ESTATUS_PROPIEDAD_LABEL,
  TERRENO_ESTATUS_PROPIEDAD_OPTIONS,
  PRIORIDAD_CONFIG,
  type TerrenoEtapa,
  type PrioridadNivel,
  type TerrenoEstatusPropiedad,
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

type Terreno = {
  id: string;
  nombre: string;
  clave_interna: string | null;
  tipo: string | null;
  municipio: string | null;
  zona_sector: string | null;
  direccion_referencia: string | null;
  objetivo: string | null;
  nombre_propietario: string | null;
  telefono_propietario: string | null;
  nombre_corredor: string | null;
  area_terreno_m2: number | null;
  areas_afectacion_m2: number | null;
  areas_aprovechables_m2: number | null;
  precio_solicitado_m2: number | null;
  precio_ofertado_m2: number | null;
  valor_interno_estimado: number | null;
  valor_objetivo_compra: number | null;
  valor_predio: number | null;
  valor_total_oferta: number | null;
  pct_diferencia_solicitado_oferta: number | null;
  origen: string | null;
  estatus_propiedad: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  fecha_captura: string;
  created_at: string;
  updated_at: string;
};

const TerrenoCreateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  municipio: z.string().default(''),
  tipo: z.string().default(''),
  objetivo: z.string().default(''),
  origen: z.string().default(''),
  area_m2: z.string().default(''),
  precio_solicitado: z.string().default(''),
  nombre_propietario: z.string().default(''),
  telefono_propietario: z.string().default(''),
});

type TerrenoCreateValues = z.infer<typeof TerrenoCreateSchema>;

const terrenoCreateDefaults: TerrenoCreateValues = {
  nombre: '',
  municipio: '',
  tipo: '',
  objetivo: '',
  origen: '',
  area_m2: '',
  precio_solicitado: '',
  nombre_propietario: '',
  telefono_propietario: '',
};

const TIPO_OPTIONS = ['Rústico', 'Urbano', 'Comercial', 'Industrial', 'Mixto', 'Otro'];
const OBJETIVO_OPTIONS = [
  'Fraccionamiento',
  'Reserva territorial',
  'Equipamiento',
  'Especulación',
  'Comercial',
  'Otro',
];
const ORIGEN_OPTIONS = [
  'Propio DILESA',
  'Ofrecido por propietario',
  'Ofrecido por corredor',
  'Prospección interna',
  'Otro',
];

const terrenoColumns: Column<Terreno>[] = [
  {
    key: 'nombre',
    label: 'Nombre',
    render: (t) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-[var(--text)]">{t.nombre}</span>
        {t.clave_interna ? (
          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/45">
            {t.clave_interna}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'ubicacion',
    label: 'Ubicación',
    sortable: false,
    accessor: (t) => t.municipio ?? '',
    render: (t) => (
      <div className="flex items-start gap-1 text-xs text-[var(--text)]/70">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--text)]/40" />
        <div className="min-w-0">
          <div className="truncate">{t.municipio ?? '—'}</div>
          {t.zona_sector ? (
            <div className="truncate text-[var(--text)]/50">{t.zona_sector}</div>
          ) : null}
        </div>
      </div>
    ),
  },
  {
    key: 'area_terreno_m2',
    label: 'Área',
    type: 'number',
    cellClassName: 'text-xs text-[var(--text)]/75',
    render: (t) => formatM2(t.area_terreno_m2),
  },
  {
    key: 'precio_solicitado_m2',
    label: 'Precio /m²',
    type: 'currency',
    cellClassName: 'text-xs text-[var(--text)]/75',
    render: (t) => (
      <>
        {formatCurrency(t.precio_solicitado_m2)}
        {t.pct_diferencia_solicitado_oferta != null ? (
          <div
            className="text-[10px] text-[var(--text)]/45"
            title="% diferencia solicitado vs ofertado"
          >
            {formatPercent(t.pct_diferencia_solicitado_oferta)}
          </div>
        ) : null}
      </>
    ),
  },
  {
    key: 'valor_predio',
    label: 'Valor predio',
    type: 'currency',
    cellClassName: 'text-xs text-[var(--text)]/75',
    render: (t) => formatCurrency(t.valor_predio, { compact: true }),
  },
  {
    key: 'etapa',
    label: 'Etapa',
    sortable: false,
    render: (t) => <EtapaBadge etapa={t.etapa} />,
  },
  {
    key: 'estatus_propiedad',
    label: 'Estatus',
    sortable: false,
    render: (t) => <StatusPropiedadLabel value={t.estatus_propiedad} />,
  },
  {
    key: 'prioridad',
    label: 'Prioridad',
    sortable: false,
    render: (t) => <PrioridadDot prioridad={t.prioridad} />,
  },
  {
    key: 'fecha_ultima_revision',
    label: 'Última revisión',
    cellClassName: 'whitespace-nowrap text-xs text-[var(--text)]/60',
    render: (t) => formatDateShort(t.fecha_ultima_revision),
  },
];

function EtapaBadge({ etapa }: { etapa: string | null }) {
  if (!etapa) return <span className="text-[var(--text)]/35">—</span>;
  const key = etapa as TerrenoEtapa;
  const cfg = TERRENO_ETAPA_CONFIG[key];
  if (!cfg) return <Badge tone="neutral">{etapa}</Badge>;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
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

function StatusPropiedadLabel({ value }: { value: string | null }) {
  if (!value) return <span className="text-[var(--text)]/35">—</span>;
  const label =
    TERRENO_ESTATUS_PROPIEDAD_LABEL[value as TerrenoEstatusPropiedad] ?? value.replace(/_/g, ' ');
  return <span className="text-xs text-[var(--text)]/75">{label}</span>;
}

function TerrenosInner() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const active = useActiveTab();

  const [terrenos, setTerrenos] = useState<Terreno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterEtapa, setFilterEtapa] = useState<string>('all');
  const [filterEstatus, setFilterEstatus] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const createForm = useZodForm({
    schema: TerrenoCreateSchema,
    defaultValues: terrenoCreateDefaults,
  });

  const fetchTerrenos = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('terrenos')
      .select('*')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('fecha_captura', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setTerrenos((data ?? []) as Terreno[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await fetchTerrenos();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchTerrenos]);

  const openCreate = () => {
    createForm.reset(terrenoCreateDefaults);
    setShowCreate(true);
  };

  const handleCreate = async (values: TerrenoCreateValues) => {
    const { data: newRow, error: err } = await supabase
      .schema('dilesa')
      .from('terrenos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        nombre: values.nombre.trim(),
        municipio: values.municipio.trim() || null,
        tipo: values.tipo || null,
        objetivo: values.objetivo || null,
        origen: values.origen || null,
        area_terreno_m2: values.area_m2 ? Number(values.area_m2) : null,
        precio_solicitado_m2: values.precio_solicitado ? Number(values.precio_solicitado) : null,
        nombre_propietario: values.nombre_propietario.trim() || null,
        telefono_propietario: values.telefono_propietario.trim() || null,
      })
      .select('id')
      .single();
    if (err) {
      alert(`Error al crear terreno: ${err.message}`);
      return;
    }
    setShowCreate(false);
    await fetchTerrenos();
    if (newRow?.id) {
      router.push(`/dilesa/terrenos/${newRow.id}`);
    }
  };

  // Filtros + search cliente-side. Para datasets pequeños (típicamente <500
  // filas de portafolio de terrenos) no se justifica query server-side por
  // cada cambio de input.
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return terrenos.filter((t) => {
      if (filterEtapa !== 'all' && t.etapa !== filterEtapa) return false;
      if (filterEstatus !== 'all' && t.estatus_propiedad !== filterEstatus) return false;
      if (!s) return true;
      return (
        t.nombre.toLowerCase().includes(s) ||
        (t.clave_interna ?? '').toLowerCase().includes(s) ||
        (t.municipio ?? '').toLowerCase().includes(s) ||
        (t.zona_sector ?? '').toLowerCase().includes(s) ||
        (t.nombre_propietario ?? '').toLowerCase().includes(s) ||
        (t.nombre_corredor ?? '').toLowerCase().includes(s)
      );
    });
  }, [terrenos, search, filterEtapa, filterEstatus]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
            DILESA · Inmobiliario
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">
            Terrenos
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Portafolio de tierra: detectados, en análisis, en negociación, adquiridos, en radar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => fetchTerrenos()} size="sm">
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button type="button" onClick={openCreate} size="sm">
            <Plus className="size-4" />
            Nuevo terreno
          </Button>
        </div>
      </header>

      <ModuleTabs
        tabs={[
          { key: 'consulta', label: 'Consulta', badge: terrenos.length },
          { key: 'resumen', label: 'Resumen' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'chart', label: 'Chart' },
        ]}
      />

      <TabPanel tabKey="consulta" active={active}>
        <ConsultaPanel
          terrenos={filtered}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          filterEtapa={filterEtapa}
          setFilterEtapa={setFilterEtapa}
          filterEstatus={filterEstatus}
          setFilterEstatus={setFilterEstatus}
          onOpenCreate={openCreate}
          onOpenDetail={(id) => router.push(`/dilesa/terrenos/${id}`)}
        />
      </TabPanel>

      <TabPanel tabKey="resumen" active={active}>
        <ResumenPanel terrenos={terrenos} loading={loading} />
      </TabPanel>

      <TabPanel tabKey="timeline" active={active}>
        <PlaceholderPanel
          title="Timeline"
          description="Cronología de cambios por terreno. Se implementa cuando terrenos_updates esté disponible (siguiente sprint). Por ahora el detalle de cada terreno muestra fecha de captura y última revisión."
        />
      </TabPanel>

      <TabPanel tabKey="chart" active={active}>
        <PlaceholderPanel
          title="Chart"
          description="Distribución por municipio, etapa y evolución mensual de captura. Próximo sprint."
        />
      </TabPanel>

      <Sheet open={showCreate} onOpenChange={setShowCreate}>
        <SheetContent side="right" className="w-full max-w-xl">
          <SheetHeader>
            <SheetTitle>Nuevo terreno</SheetTitle>
            <SheetDescription>
              Solo campos esenciales — el resto del expediente se captura después desde el detalle.
            </SheetDescription>
          </SheetHeader>
          <Form form={createForm} onSubmit={handleCreate} className="mt-6 space-y-5">
            <FormField name="nombre" label="Nombre del terreno" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  placeholder="Ej. Rancho Los Nogales"
                />
              )}
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="municipio" label="Municipio">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    placeholder="Piedras Negras, Nava, Acuña…"
                  />
                )}
              </FormField>
              <FormField name="tipo" label="Tipo">
                {(field) => (
                  <select
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                  >
                    <option value="">(sin definir)</option>
                    {TIPO_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="objetivo" label="Objetivo">
                {(field) => (
                  <select
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                  >
                    <option value="">(sin definir)</option>
                    {OBJETIVO_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField name="origen" label="Origen">
                {(field) => (
                  <select
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
                  >
                    <option value="">(sin definir)</option>
                    {ORIGEN_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="area_m2" label="Área total (m²)">
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
              <FormField name="precio_solicitado" label="Precio solicitado / m²">
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
              <FormField name="nombre_propietario" label="Propietario">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    placeholder="Nombre"
                  />
                )}
              </FormField>
              <FormField name="telefono_propietario" label="Teléfono propietario">
                {(field) => (
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    placeholder="10 dígitos"
                  />
                )}
              </FormField>
            </div>

            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Crear terreno"
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
  terrenos: Terreno[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filterEtapa: string;
  setFilterEtapa: (v: string) => void;
  filterEstatus: string;
  setFilterEstatus: (v: string) => void;
  onOpenCreate: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const {
    terrenos,
    loading,
    error,
    search,
    setSearch,
    filterEtapa,
    setFilterEtapa,
    filterEstatus,
    setFilterEstatus,
    onOpenCreate,
    onOpenDetail,
  } = props;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, clave, municipio, propietario…"
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
          {TERRENO_ETAPA_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {TERRENO_ETAPA_CONFIG[o].label}
            </option>
          ))}
        </select>
        <select
          value={filterEstatus}
          onChange={(e) => setFilterEstatus(e.target.value)}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
          aria-label="Filtrar por estatus de propiedad"
        >
          <option value="all">Todos los estatus</option>
          {TERRENO_ESTATUS_PROPIEDAD_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {TERRENO_ESTATUS_PROPIEDAD_LABEL[o]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          No se pudieron cargar los terrenos: {error}
        </div>
      ) : terrenos.length === 0 ? (
        <EmptyStateImported
          entityLabel="Terrenos"
          description="Captura el primer terreno para arrancar el portafolio o importa desde Coda cuando esté disponible."
          onCreate={onOpenCreate}
        />
      ) : (
        <DataTable<Terreno>
          data={terrenos}
          columns={terrenoColumns}
          rowKey="id"
          onRowClick={(t) => onOpenDetail(t.id)}
          initialSort={{ key: 'fecha_captura', dir: 'desc' }}
          emptyTitle="Sin resultados"
          showDensityToggle={false}
        />
      )}
    </div>
  );
}

function ResumenPanel({ terrenos, loading }: { terrenos: Terreno[]; loading: boolean }) {
  const kpis = useMemo(() => {
    const adquiridos = terrenos.filter((t) => t.estatus_propiedad === 'adquirido');
    const valorPortafolio = adquiridos.reduce((acc, t) => acc + (t.valor_predio ?? 0), 0);
    const areaPortafolio = adquiridos.reduce((acc, t) => acc + (t.area_terreno_m2 ?? 0), 0);
    const porEtapa = new Map<string, number>();
    terrenos.forEach((t) => {
      const k = t.etapa ?? 'sin_etapa';
      porEtapa.set(k, (porEtapa.get(k) ?? 0) + 1);
    });
    const altaPrioridad = terrenos.filter((t) => t.prioridad === 'alta').length;
    return {
      total: terrenos.length,
      adquiridos: adquiridos.length,
      valorPortafolio,
      areaPortafolio,
      porEtapa: Array.from(porEtapa.entries()).sort((a, b) => b[1] - a[1]),
      altaPrioridad,
    };
  }, [terrenos]);

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
        <KpiCard label="Terrenos totales" value={kpis.total.toLocaleString('es-MX')} />
        <KpiCard label="Adquiridos" value={kpis.adquiridos.toLocaleString('es-MX')} />
        <KpiCard label="Área portafolio adquirido" value={formatM2(kpis.areaPortafolio)} />
        <KpiCard
          label="Valor portafolio (solicitado)"
          value={formatCurrency(kpis.valorPortafolio, { compact: true })}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Distribución por etapa
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.porEtapa.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">(sin datos)</li>
            ) : (
              kpis.porEtapa.map(([etapa, count]) => (
                <li key={etapa} className="flex items-center justify-between gap-3">
                  <EtapaBadge etapa={etapa === 'sin_etapa' ? null : etapa} />
                  <span className="text-sm tabular-nums text-[var(--text)]/70">{count}</span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Alertas
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text)]/75">
            <li>
              Alta prioridad sin cerrar:{' '}
              <span className="font-semibold text-[var(--text)]">{kpis.altaPrioridad}</span>
            </li>
            <li className="text-[var(--text)]/50">
              TODO: terrenos sin revisar en &gt;30 días, terrenos sin responsable, terrenos sin KMZ
            </li>
          </ul>
        </section>
      </div>
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

/**
 * @module Terrenos (DILESA)
 * @responsive desktop-only
 */
export default function TerrenosPage() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Terrenos" />
      <div className="hidden sm:block">
        <Suspense fallback={<div className="p-6 text-sm text-[var(--text)]/55">Cargando…</div>}>
          <TerrenosInner />
        </Suspense>
      </div>
    </RequireAccess>
  );
}
