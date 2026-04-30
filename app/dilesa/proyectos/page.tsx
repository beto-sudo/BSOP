'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: setLoading/setError before firing async fetch; misma
 * convención que terrenos, prototipos y el resto del panel.
 */

/**
 * Módulo Proyectos — master page.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-proyectos). Cuarto y último módulo
 * del backbone inmobiliario. Un proyecto nace del endpoint
 * /api/dilesa/anteproyectos/[id]/convertir (PR anteproyectos) o manualmente
 * vía la Sheet de Alta para casos legacy sin anteproyecto.
 *
 * Alcance del scaffold:
 *   - Consulta: tabla master con identidad + origen (terreno/anteproyecto) +
 *     snapshot físico/financiero + gestión.
 *   - Alta manual: Sheet lateral con campos mínimos. El expediente completo
 *     se llena desde el detalle.
 *   - Resumen: KPIs de activos, agrupación por fase, inversión comprometida,
 *     valor comercial proyectado (suma de cantidad × precio_efectivo de
 *     fraccionamiento_prototipo), top 5 por valor comercial.
 *   - Timeline / Chart: placeholders.
 *
 * Schema: supabase/SCHEMA_REF.md §dilesa.proyectos, §dilesa.fraccionamiento_prototipo.
 */

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Plus, Search, RefreshCw, Link2 } from 'lucide-react';
import { z } from 'zod';
import { Form, FormActions, FormField, useZodForm } from '@/components/forms';
import {
  PROYECTO_FASE_CONFIG,
  PROYECTO_FASE_OPTIONS,
  PRIORIDAD_CONFIG,
  type ProyectoFase,
  type PrioridadNivel,
} from '@/lib/status-tokens';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
} from '@/lib/dilesa-constants';
import { ModuleTabs, TabPanel, useActiveTab } from '@/components/shared/module-tabs';
import { EmptyStateImported } from '@/components/shared/empty-state-imported';

const ProyectoCreateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  codigo: z.string().default(''),
  terreno_id: z.string().min(1, 'El terreno es obligatorio'),
  tipo_proyecto_id: z.string().default(''),
  fecha_inicio: z.string().default(''),
  notas: z.string().default(''),
});

type ProyectoCreateValues = z.infer<typeof ProyectoCreateSchema>;

const proyectoCreateDefaults: ProyectoCreateValues = {
  nombre: '',
  codigo: '',
  terreno_id: '',
  tipo_proyecto_id: '',
  fecha_inicio: '',
  notas: '',
};

type Proyecto = {
  id: string;
  nombre: string;
  codigo: string | null;
  terreno_id: string;
  terreno: { nombre: string; clave_interna: string | null } | null;
  anteproyecto_id: string | null;
  anteproyecto: { nombre: string; clave_interna: string | null } | null;
  tipo_proyecto_id: string | null;
  tipo_proyecto: { nombre: string } | null;
  fase: string | null;
  fecha_inicio: string | null;
  fecha_estimada_cierre: string | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  cantidad_lotes_total: number | null;
  presupuesto_total: number | null;
  inversion_total: number | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  created_at: string;
  updated_at: string;
};

type TerrenoLookup = { id: string; nombre: string; clave_interna: string | null };
type TipoProyectoLookup = { id: string; nombre: string };

function FaseBadge({ fase }: { fase: string | null }) {
  if (!fase) return <span className="text-[var(--text)]/35">—</span>;
  const key = fase as ProyectoFase;
  const cfg = PROYECTO_FASE_CONFIG[key];
  if (!cfg) return <Badge tone="neutral">{fase}</Badge>;
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

function ProyectosInner() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const active = useActiveTab();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [valorComercialByProyecto, setValorComercialByProyecto] = useState<Map<string, number>>(
    new Map()
  );
  const [terrenos, setTerrenos] = useState<TerrenoLookup[]>([]);
  const [tiposProyecto, setTiposProyecto] = useState<TipoProyectoLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterFase, setFilterFase] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const createForm = useZodForm({
    schema: ProyectoCreateSchema,
    defaultValues: proyectoCreateDefaults,
  });

  const fetchProyectos = useCallback(async () => {
    // Embed ambiguo cuando hay más de una FK entre tablas: especificamos nombre
    // explícito de la FK. Acá solo hay una hacia cada tabla, pero usamos la
    // sintaxis column:table(fields) por claridad y robustez ante futuros FKs.
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .select(
        '*, terreno:terreno_id(nombre, clave_interna), anteproyecto:anteproyecto_id(nombre, clave_interna), tipo_proyecto:tipo_proyecto_id(nombre)'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setProyectos((data ?? []) as unknown as Proyecto[]);
  }, [supabase]);

  const fetchValorComercial = useCallback(async () => {
    // Agregado cliente-side: leemos todas las filas vivas de
    // fraccionamiento_prototipo con el valor comercial del prototipo embebido
    // y calculamos cantidad × precio_efectivo (precio_venta o fallback a
    // prototipos.valor_comercial). Para el volumen esperado (decenas de
    // proyectos × decenas de prototipos cada uno) no justifica un RPC.
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('fraccionamiento_prototipo')
      .select(
        'proyecto_id, cantidad_unidades, precio_venta, prototipo:prototipo_id(valor_comercial)'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null);
    if (err) {
      // Silencioso: el resumen seguirá mostrando 0s en esta métrica si falla.
      return;
    }
    const agg = new Map<string, number>();
    type Row = {
      proyecto_id: string;
      cantidad_unidades: number | null;
      precio_venta: number | null;
      prototipo: { valor_comercial: number | null } | null;
    };
    (data as unknown as Row[]).forEach((row) => {
      const cantidad = row.cantidad_unidades ?? 0;
      const precio = row.precio_venta ?? row.prototipo?.valor_comercial ?? 0;
      const monto = cantidad * precio;
      agg.set(row.proyecto_id, (agg.get(row.proyecto_id) ?? 0) + monto);
    });
    setValorComercialByProyecto(agg);
  }, [supabase]);

  const fetchLookups = useCallback(async () => {
    const [terrenosRes, tiposRes] = await Promise.all([
      supabase
        .schema('dilesa')
        .from('terrenos')
        .select('id, nombre, clave_interna')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre'),
      supabase
        .schema('dilesa')
        .from('tipo_proyecto')
        .select('id, nombre')
        .or(`empresa_id.eq.${DILESA_EMPRESA_ID},empresa_id.is.null`)
        .eq('activo', true)
        .order('orden'),
    ]);
    if (!terrenosRes.error) setTerrenos((terrenosRes.data ?? []) as TerrenoLookup[]);
    if (!tiposRes.error) setTiposProyecto((tiposRes.data ?? []) as TipoProyectoLookup[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await Promise.all([fetchProyectos(), fetchValorComercial(), fetchLookups()]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchProyectos, fetchValorComercial, fetchLookups]);

  const openCreate = () => {
    createForm.reset(proyectoCreateDefaults);
    setShowCreate(true);
  };

  const handleCreate = async (values: ProyectoCreateValues) => {
    const { data: newRow, error: err } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        nombre: values.nombre.trim(),
        codigo: values.codigo.trim() || null,
        terreno_id: values.terreno_id,
        tipo_proyecto_id: values.tipo_proyecto_id || null,
        fecha_inicio: values.fecha_inicio || null,
        fase: 'planeacion',
        etapa: 'planeacion',
        decision_actual: 'desarrollar',
        notas: values.notas.trim() || null,
      })
      .select('id')
      .single();
    if (err) {
      alert(`Error al crear proyecto: ${err.message}`);
      return;
    }
    setShowCreate(false);
    await fetchProyectos();
    if (newRow?.id) {
      router.push(`/dilesa/proyectos/${newRow.id}`);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return proyectos.filter((p) => {
      if (filterFase !== 'all' && p.fase !== filterFase) return false;
      if (!s) return true;
      return (
        p.nombre.toLowerCase().includes(s) ||
        (p.codigo ?? '').toLowerCase().includes(s) ||
        (p.terreno?.nombre ?? '').toLowerCase().includes(s) ||
        (p.terreno?.clave_interna ?? '').toLowerCase().includes(s)
      );
    });
  }, [proyectos, search, filterFase]);

  const terrenoOptions = useMemo<ComboboxOption[]>(
    () =>
      terrenos.map((t) => ({
        value: t.id,
        label: t.nombre,
        searchLabel: `${t.nombre} ${t.clave_interna ?? ''}`,
        sub: t.clave_interna ?? undefined,
      })),
    [terrenos]
  );
  const tipoOptions = useMemo<ComboboxOption[]>(
    () => tiposProyecto.map((t) => ({ value: t.id, label: t.nombre })),
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
            Proyectos
          </h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Desarrollos formalizados. Alimentan lotes, construcción, inventario y comercial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => fetchProyectos()} size="sm">
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          <Button type="button" onClick={openCreate} size="sm">
            <Plus className="size-4" />
            Nuevo proyecto
          </Button>
        </div>
      </header>

      <ModuleTabs
        tabs={[
          { key: 'consulta', label: 'Consulta', badge: proyectos.length },
          { key: 'resumen', label: 'Resumen' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'chart', label: 'Chart' },
        ]}
      />

      <TabPanel tabKey="consulta" active={active}>
        <ConsultaPanel
          data={filtered}
          universeCount={proyectos.length}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          filterFase={filterFase}
          setFilterFase={setFilterFase}
          onOpenCreate={openCreate}
          onOpenDetail={(id) => router.push(`/dilesa/proyectos/${id}`)}
        />
      </TabPanel>

      <TabPanel tabKey="resumen" active={active}>
        <ResumenPanel
          proyectos={proyectos}
          valorComercialByProyecto={valorComercialByProyecto}
          loading={loading}
        />
      </TabPanel>

      <TabPanel tabKey="timeline" active={active}>
        <PlaceholderPanel
          title="Timeline"
          description="Cronología por proyecto (cambio de fase, inversión acumulada, avance). Se implementa cuando proyectos_updates esté disponible."
        />
      </TabPanel>

      <TabPanel tabKey="chart" active={active}>
        <PlaceholderPanel
          title="Chart"
          description="Distribución por fase, valor comercial proyectado vs inversión, evolución de cartera. Próximo sprint."
        />
      </TabPanel>

      <DetailDrawer
        open={showCreate}
        onOpenChange={setShowCreate}
        size="md"
        title="Nuevo proyecto"
        description="Captura manual para proyectos sin anteproyecto de origen (casos legacy). Los proyectos nuevos normalmente nacen del botón “Convertir a proyecto” dentro de Anteproyectos."
      >
        <DetailDrawerContent>
          <Form form={createForm} onSubmit={handleCreate} className="space-y-5">
            <FormField name="nombre" label="Nombre" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  placeholder="Ej. Fracc. Los Nogales Etapa I"
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
                  placeholder="Ej. LNE1"
                />
              )}
            </FormField>
            <FormField name="terreno_id" label="Terreno" required>
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={terrenoOptions}
                  placeholder={
                    terrenoOptions.length === 0 ? 'No hay terrenos activos' : 'Selecciona terreno…'
                  }
                  searchPlaceholder="Buscar por nombre o clave…"
                  disabled={terrenoOptions.length === 0}
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="tipo_proyecto_id" label="Tipo de proyecto">
                {(field) => (
                  <Combobox
                    id={field.id}
                    value={field.value}
                    onChange={field.onChange}
                    options={tipoOptions}
                    placeholder="(opcional)"
                    allowClear
                  />
                )}
              </FormField>
              <FormField name="fecha_inicio" label="Fecha de inicio">
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
            <FormField name="notas" label="Notas">
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  placeholder="Contexto del proyecto"
                />
              )}
            </FormField>
            <p className="text-xs text-[var(--text)]/50">
              El proyecto se crea en fase <strong>planeación</strong>. El resto del expediente
              (presupuesto, área vendible, fraccionamiento de prototipos) se captura en el detalle.
            </p>
            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Crear proyecto"
              submittingLabel="Creando..."
              submitIcon={<Plus className="size-4" />}
              onCancel={() => setShowCreate(false)}
              className="border-t-0 pt-2"
            />
          </Form>
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

function ConsultaPanel(props: {
  data: Proyecto[];
  universeCount: number;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filterFase: string;
  setFilterFase: (v: string) => void;
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
    filterFase,
    setFilterFase,
    onOpenCreate,
    onOpenDetail,
  } = props;

  const columns: Column<Proyecto>[] = [
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
      key: 'terreno',
      label: 'Terreno',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/70',
      render: (p) =>
        p.terreno ? (
          <div className="flex min-w-0 flex-col">
            <span className="truncate">{p.terreno.nombre}</span>
            {p.terreno.clave_interna ? (
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/40">
                {p.terreno.clave_interna}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'anteproyecto',
      label: 'Anteproyecto',
      sortable: false,
      render: (p) =>
        p.anteproyecto_id ? (
          <span
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"
            title={
              p.anteproyecto?.nombre
                ? `← Desde anteproyecto: ${p.anteproyecto.nombre}`
                : '← Desde anteproyecto'
            }
          >
            <Link2 className="size-3" />
            {p.anteproyecto?.clave_interna ?? p.anteproyecto?.nombre?.slice(0, 22) ?? 'origen'}
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-[var(--text)]/40">manual</span>
        ),
    },
    {
      key: 'tipo_proyecto',
      label: 'Tipo',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/70',
      render: (p) => p.tipo_proyecto?.nombre ?? <span className="text-[var(--text)]/40">—</span>,
    },
    {
      key: 'fase',
      label: 'Fase',
      render: (p) => <FaseBadge fase={p.fase} />,
    },
    {
      key: 'fecha_inicio',
      label: 'Inicio',
      cellClassName: 'whitespace-nowrap text-xs text-[var(--text)]/70',
      render: (p) => formatDateShort(p.fecha_inicio),
    },
    {
      key: 'fecha_estimada_cierre',
      label: 'Cierre est.',
      cellClassName: 'whitespace-nowrap text-xs text-[var(--text)]/70',
      render: (p) => formatDateShort(p.fecha_estimada_cierre),
    },
    {
      key: 'cantidad_lotes_total',
      label: 'Lotes',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => p.cantidad_lotes_total ?? '—',
    },
    {
      key: 'area_vendible_m2',
      label: 'Área vendible',
      type: 'number',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => formatM2(p.area_vendible_m2),
    },
    {
      key: 'presupuesto_total',
      label: 'Presupuesto',
      type: 'currency',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => formatCurrency(p.presupuesto_total, { compact: true }),
    },
    {
      key: 'inversion_total',
      label: 'Inversión',
      type: 'currency',
      cellClassName: 'text-xs text-[var(--text)]/75',
      render: (p) => formatCurrency(p.inversion_total, { compact: true }),
    },
    {
      key: 'etapa',
      label: 'Etapa',
      sortable: false,
      cellClassName: 'text-xs text-[var(--text)]/70',
      render: (p) => p.etapa ?? '—',
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
      label: 'Última rev.',
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
            placeholder="Buscar nombre, código, terreno…"
            className="pl-8"
          />
        </div>
        <select
          value={filterFase}
          onChange={(e) => setFilterFase(e.target.value)}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
          aria-label="Filtrar por fase"
        >
          <option value="all">Todas las fases</option>
          {PROYECTO_FASE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {PROYECTO_FASE_CONFIG[o].label}
            </option>
          ))}
        </select>
      </div>

      {universeCount === 0 && !loading && !error ? (
        <EmptyStateImported
          entityLabel="Proyectos"
          description="Convierte un anteproyecto desde su detalle, o captura manualmente un proyecto legacy si no tiene origen en anteproyectos."
          onCreate={onOpenCreate}
        />
      ) : (
        <DataTable<Proyecto>
          data={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          error={error}
          onRowClick={(p) => onOpenDetail(p.id)}
          initialSort={{ key: 'fecha_inicio', dir: 'desc' }}
          showDensityToggle={false}
          emptyTitle="Sin resultados"
          emptyDescription="Limpia los filtros para ver todos los proyectos."
        />
      )}
    </div>
  );
}

function ResumenPanel({
  proyectos,
  valorComercialByProyecto,
  loading,
}: {
  proyectos: Proyecto[];
  valorComercialByProyecto: Map<string, number>;
  loading: boolean;
}) {
  const kpis = useMemo(() => {
    const activos = proyectos.filter((p) => p.fase && p.fase !== 'cerrado');
    const enConstruccion = proyectos.filter(
      (p) => p.fase === 'construccion' || p.fase === 'urbanizacion'
    ).length;
    const enPlaneacion = proyectos.filter((p) => p.fase === 'planeacion').length;
    const inversionComprometida = proyectos.reduce((acc, p) => acc + (p.inversion_total ?? 0), 0);
    const valorComercialTotal = Array.from(valorComercialByProyecto.values()).reduce(
      (acc, v) => acc + v,
      0
    );
    const porFase = new Map<string, number>();
    proyectos.forEach((p) => {
      const k = p.fase ?? 'sin_fase';
      porFase.set(k, (porFase.get(k) ?? 0) + 1);
    });
    const top5 = proyectos
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        valor: valorComercialByProyecto.get(p.id) ?? 0,
      }))
      .filter((p) => p.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    return {
      total: proyectos.length,
      activos: activos.length,
      enConstruccion,
      enPlaneacion,
      inversionComprometida,
      valorComercialTotal,
      porFase: Array.from(porFase.entries()).sort((a, b) => b[1] - a[1]),
      top5,
    };
  }, [proyectos, valorComercialByProyecto]);

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
        <KpiCard label="Proyectos totales" value={kpis.total.toLocaleString('es-MX')} />
        <KpiCard label="Activos" value={kpis.activos.toLocaleString('es-MX')} />
        <KpiCard
          label="En construcción / urbanización"
          value={kpis.enConstruccion.toLocaleString('es-MX')}
          hint={`${kpis.enPlaneacion.toLocaleString('es-MX')} en planeación`}
        />
        <KpiCard
          label="Inversión comprometida"
          value={formatCurrency(kpis.inversionComprometida, { compact: true })}
          hint={`${formatCurrency(kpis.valorComercialTotal, { compact: true })} valor comercial proyectado`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Distribución por fase
          </h3>
          <ul className="mt-3 space-y-2">
            {kpis.porFase.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">(sin datos)</li>
            ) : (
              kpis.porFase.map(([fase, count]) => (
                <li key={fase} className="flex items-center justify-between gap-3">
                  <FaseBadge fase={fase === 'sin_fase' ? null : fase} />
                  <span className="text-sm tabular-nums text-[var(--text)]/70">{count}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
            Top 5 · Valor comercial proyectado
          </h3>
          <p className="mt-1 text-[11px] text-[var(--text)]/45">
            Suma de cantidad × precio efectivo (precio_venta o fallback a valor_comercial del
            prototipo) del fraccionamiento real del proyecto.
          </p>
          <ul className="mt-3 space-y-2">
            {kpis.top5.length === 0 ? (
              <li className="text-sm text-[var(--text)]/50">
                Aún no hay fraccionamiento capturado en ningún proyecto.
              </li>
            ) : (
              kpis.top5.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--text)]/75">{row.nombre}</span>
                  <span className="tabular-nums text-[var(--text)]">
                    {formatCurrency(row.valor, { compact: true })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-[var(--text)]/50">{hint}</div> : null}
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
 * @module Proyectos (DILESA)
 * @responsive desktop-only
 */
export default function ProyectosPage() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Proyectos" />
      <div className="hidden sm:block">
        <Suspense fallback={<div className="p-6 text-sm text-[var(--text)]/55">Cargando…</div>}>
          <ProyectosInner />
        </Suspense>
      </div>
    </RequireAccess>
  );
}
