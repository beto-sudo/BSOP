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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, Loader2, ImageOff, FileWarning } from 'lucide-react';
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
  const [creating, setCreating] = useState(false);
  const [createNombre, setCreateNombre] = useState('');
  const [createCodigo, setCreateCodigo] = useState('');
  const [createSupConstruida, setCreateSupConstruida] = useState('');
  const [createSupLoteMin, setCreateSupLoteMin] = useState('');
  const [createRecamaras, setCreateRecamaras] = useState('');
  const [createBanos, setCreateBanos] = useState('');
  const [createValorComercial, setCreateValorComercial] = useState('');
  const [createCostoUrban, setCreateCostoUrban] = useState('');
  const [createCostoMateriales, setCreateCostoMateriales] = useState('');
  const [createCostoManoObra, setCreateCostoManoObra] = useState('');
  const [createCostoRuv, setCreateCostoRuv] = useState('');
  const [createSeguroCalidad, setCreateSeguroCalidad] = useState('');
  const [createCostoComer, setCreateCostoComer] = useState('');

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
    setCreateNombre('');
    setCreateCodigo('');
    setCreateSupConstruida('');
    setCreateSupLoteMin('');
    setCreateRecamaras('');
    setCreateBanos('');
    setCreateValorComercial('');
    setCreateCostoUrban('');
    setCreateCostoMateriales('');
    setCreateCostoManoObra('');
    setCreateCostoRuv('');
    setCreateSeguroCalidad('');
    setCreateCostoComer('');
    setShowCreate(true);
  };

  const parseNum = (v: string) => (v.trim() ? Number(v) : null);

  const handleCreate = async () => {
    if (!createNombre.trim()) return;
    setCreating(true);
    // costo_total_unitario NO se envía en Insert — es GENERATED en DB.
    const { data: newRow, error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        nombre: createNombre.trim(),
        codigo: createCodigo.trim() || null,
        superficie_construida_m2: parseNum(createSupConstruida),
        superficie_lote_min_m2: parseNum(createSupLoteMin),
        recamaras: createRecamaras.trim() ? Number.parseInt(createRecamaras, 10) : null,
        banos: parseNum(createBanos),
        valor_comercial: parseNum(createValorComercial),
        costo_urbanizacion: parseNum(createCostoUrban),
        costo_materiales: parseNum(createCostoMateriales),
        costo_mano_obra: parseNum(createCostoManoObra),
        costo_registro_ruv: parseNum(createCostoRuv),
        seguro_calidad: parseNum(createSeguroCalidad),
        costo_comercializacion: parseNum(createCostoComer),
      })
      .select('id')
      .single();
    setCreating(false);
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

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Prototipo>('created_at', 'desc');
  const sorted = useMemo(
    () => sortData(filtered as unknown as Record<string, unknown>[]) as unknown as Prototipo[],
    [filtered, sortData]
  );

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
          prototipos={sorted}
          loading={loading}
          error={error}
          search={search}
          setSearch={setSearch}
          filterEtapa={filterEtapa}
          setFilterEtapa={setFilterEtapa}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
            className="mt-6 space-y-5"
          >
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Identidad
              </h3>
              <div>
                <FieldLabel htmlFor="p-nombre" required>
                  Nombre
                </FieldLabel>
                <Input
                  id="p-nombre"
                  value={createNombre}
                  onChange={(e) => setCreateNombre(e.target.value)}
                  placeholder="Ej. Modelo Nogal 72"
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-codigo">Código</FieldLabel>
                <Input
                  id="p-codigo"
                  value={createCodigo}
                  onChange={(e) => setCreateCodigo(e.target.value)}
                  placeholder="Ej. NGL-72"
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Dimensiones
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="p-sup-const">Superficie construida (m²)</FieldLabel>
                  <Input
                    id="p-sup-const"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createSupConstruida}
                    onChange={(e) => setCreateSupConstruida(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-sup-lote">Lote mínimo (m²)</FieldLabel>
                  <Input
                    id="p-sup-lote"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createSupLoteMin}
                    onChange={(e) => setCreateSupLoteMin(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="p-rec">Recámaras</FieldLabel>
                  <Input
                    id="p-rec"
                    type="number"
                    step="1"
                    inputMode="numeric"
                    value={createRecamaras}
                    onChange={(e) => setCreateRecamaras(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-ban">Baños</FieldLabel>
                  <Input
                    id="p-ban"
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    value={createBanos}
                    onChange={(e) => setCreateBanos(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
                Económica
              </h3>
              <div>
                <FieldLabel htmlFor="p-valor">Valor comercial</FieldLabel>
                <Input
                  id="p-valor"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={createValorComercial}
                  onChange={(e) => setCreateValorComercial(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="p-urban">Costo urbanización</FieldLabel>
                  <Input
                    id="p-urban"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createCostoUrban}
                    onChange={(e) => setCreateCostoUrban(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-mat">Costo materiales</FieldLabel>
                  <Input
                    id="p-mat"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createCostoMateriales}
                    onChange={(e) => setCreateCostoMateriales(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-mo">Costo mano de obra</FieldLabel>
                  <Input
                    id="p-mo"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createCostoManoObra}
                    onChange={(e) => setCreateCostoManoObra(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-ruv">Registro RUV</FieldLabel>
                  <Input
                    id="p-ruv"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createCostoRuv}
                    onChange={(e) => setCreateCostoRuv(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-seg">Seguro de calidad</FieldLabel>
                  <Input
                    id="p-seg"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createSeguroCalidad}
                    onChange={(e) => setCreateSeguroCalidad(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="p-com">Comercialización</FieldLabel>
                  <Input
                    id="p-com"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={createCostoComer}
                    onChange={(e) => setCreateCostoComer(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating || !createNombre.trim()}>
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Crear prototipo
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConsultaPanel(props: {
  prototipos: Prototipo[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (v: string) => void;
  filterEtapa: string;
  setFilterEtapa: (v: string) => void;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  onOpenCreate: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const {
    prototipos,
    loading,
    error,
    search,
    setSearch,
    filterEtapa,
    setFilterEtapa,
    sortKey,
    sortDir,
    onSort,
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
          No se pudieron cargar los prototipos: {error}
        </div>
      ) : prototipos.length === 0 ? (
        <EmptyStateImported
          entityLabel="Prototipos"
          description="Captura el primer prototipo para arrancar el catálogo o importa desde Coda cuando esté disponible."
          onCreate={onOpenCreate}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="nombre"
                  label="Nombre"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <TableHead>Clasificación</TableHead>
                <SortableHead
                  sortKey="superficie_construida_m2"
                  label="Sup. construida"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="recamaras"
                  label="Rec."
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="banos"
                  label="Baños"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="valor_comercial"
                  label="Valor comercial"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="costo_total_unitario"
                  label="Costo total"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <TableHead>Margen</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Responsable</TableHead>
                <SortableHead
                  sortKey="fecha_ultima_revision"
                  label="Última revisión"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prototipos.map((p) => {
                const margen =
                  p.valor_comercial != null && p.costo_total_unitario != null
                    ? p.valor_comercial - p.costo_total_unitario
                    : null;
                return (
                  <TableRow
                    key={p.id}
                    onClick={() => onOpenDetail(p.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-[var(--text)]">{p.nombre}</span>
                        {p.codigo ? (
                          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text)]/45">
                            {p.codigo}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[var(--text)]/70">
                      {p.clasificacion_inmobiliaria?.nombre ?? (
                        <span className="text-[var(--text)]/40">(sin clasificar)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-[var(--text)]/75">
                      {formatM2(p.superficie_construida_m2)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-[var(--text)]/75">
                      {p.recamaras ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-[var(--text)]/75">
                      {p.banos ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs font-medium tabular-nums text-[var(--text)]">
                      {formatCurrency(p.valor_comercial)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-[var(--text)]/75">
                      {formatCurrency(p.costo_total_unitario)}
                    </TableCell>
                    <TableCell
                      className={`text-xs tabular-nums ${
                        margen != null && margen < 0
                          ? 'font-semibold text-red-400'
                          : 'text-[var(--text)]/75'
                      }`}
                    >
                      {margen != null ? formatCurrency(margen) : '—'}
                    </TableCell>
                    <TableCell>
                      <EtapaBadge etapa={p.etapa} />
                    </TableCell>
                    <TableCell>
                      <PrioridadDot prioridad={p.prioridad} />
                    </TableCell>
                    <TableCell className="text-xs text-[var(--text)]/60">
                      {p.responsable_id ? (
                        <span className="font-mono text-[10px]">
                          {p.responsable_id.slice(0, 8)}…
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--text)]/60">
                      {formatDateShort(p.fecha_ultima_revision)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
