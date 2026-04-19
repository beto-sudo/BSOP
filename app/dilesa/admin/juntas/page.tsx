'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing data-sync pattern flagged by the new React
 * hook rule. Rewriting changes render semantics — out of scope for lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterCombobox, type FilterComboboxOption } from '@/components/ui/filter-combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, Loader2, CalendarDays, ChevronRight, Play } from 'lucide-react';
import { JUNTA_ESTADO_CONFIG as ESTADO_CONFIG, type JuntaEstado } from '@/lib/status-tokens';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number | null;
  lugar: string | null;
  estado: JuntaEstado;
  tipo: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
};

const TIPO_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'Comité Ejecutivo', label: 'Comité Ejecutivo', icon: '👔' },
  { value: 'Consejo', label: 'Consejo', icon: '🏢' },
  { value: 'Ventas', label: 'Ventas', icon: '💰' },
  { value: 'Atención PosVenta', label: 'Atención PosVenta', icon: '🔧' },
  { value: 'Administración', label: 'Administración', icon: '📁' },
  { value: 'Mercadotecnia', label: 'Mercadotecnia', icon: '📣' },
  { value: 'Construcción', label: 'Construcción', icon: '🏗️' },
  { value: 'Compras y Admon. Inventario', label: 'Compras y Admon. Inv.', icon: '📦' },
  { value: 'Maquinaria', label: 'Maquinaria', icon: '🚜' },
  { value: 'Proyectos', label: 'Proyectos', icon: '🗂️' },
  { value: 'Rincón del Bosque', label: 'Rincón del Bosque', icon: '🌲' },
  { value: 'Extraordinaria', label: 'Extraordinaria', icon: '🚨' },
  { value: 'Otro', label: 'Otro', icon: '📌' },
];

const TIPO_CONFIG: Record<string, { label: string; icon: string }> = Object.fromEntries([
  ...TIPO_OPTIONS.map((t) => [t.value, { label: t.label, icon: t.icon }]),
  // Legacy aliases from Coda import
  ['Comite Ejecutivo', { label: 'Comité Ejecutivo', icon: '👔' }],
  ['Junta Operativa', { label: 'Comité Ejecutivo', icon: '👔' }],
  ['Junta de Área', { label: 'Junta de Área', icon: '📋' }],
  ['operativa', { label: 'Operativa', icon: '⚙️' }],
  ['directiva', { label: 'Directiva', icon: '🏛️' }],
  ['seguimiento', { label: 'Seguimiento', icon: '📊' }],
  ['emergencia', { label: 'Emergencia', icon: '🚨' }],
]);

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function EstadoBadge({ estado }: { estado: Junta['estado'] }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function nowDatetimeLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateTitulo(fechaHora: string, tipo: string) {
  if (!fechaHora || !tipo) return '';
  const d = new Date(fechaHora);
  // ISO-style date (YYYY-MM-DD) in local timezone — matches the historical
  // format used across 700+ juntas ("2026-04-08, 9:05 AM - Comite Ejecutivo").
  // Do NOT switch to toLocaleDateString('es-MX', ...) — that produces
  // DD/MM/YYYY which is visually inconsistent and sorts poorly.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const fecha = `${yyyy}-${mm}-${dd}`;
  // en-US gives "9:05 AM" (no leading zero, uppercase AM/PM, no dots) which is
  // what the legacy titles use.
  const hora = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${fecha}, ${hora} - ${tipo}`;
}

/**
 * TEMP component: shows a small preview of the junta's descripcion so Beto
 * can eyeball what's already in BSOP while comparing side-by-side with Coda
 * during the image backfill. Remove this + its column when backfill is done.
 */
function JuntaContentPreview({ descripcion }: { descripcion: string | null }) {
  if (!descripcion) {
    return <span className="text-xs text-[var(--text)]/40">(vacía)</span>;
  }
  // Plain text excerpt — strip HTML tags + collapse whitespace
  const plain = descripcion
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const excerpt = plain.length > 200 ? `${plain.slice(0, 200).trim()}…` : plain;
  const imgCount = (descripcion.match(/<img\b/gi) ?? []).length;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span
          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono ${
            imgCount > 0
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-[var(--border)]/40 text-[var(--text)]/40'
          }`}
        >
          {imgCount > 0 ? `📷 ${imgCount}` : '📷 0'}
        </span>
        <span className="inline-flex items-center gap-0.5 rounded bg-[var(--border)]/40 px-1.5 py-0.5 font-mono text-[var(--text)]/50">
          {plain.length.toLocaleString()} chars
        </span>
      </div>
      <p className="line-clamp-3 text-xs leading-snug text-[var(--text)]/65">{excerpt}</p>
    </div>
  );
}

function JuntasInner() {
  const router = useRouter();
  const supabase = createSupabaseERPClient();

  const [juntas, setJuntas] = useState<Junta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [asistenciaCounts, setAsistenciaCounts] = useState<Map<string, number>>(new Map());
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map());
  // "Avanzadas"  = # tareas de la junta con ≥1 registro en task_updates —
  //                las que aparecen en la sección "Actualizaciones de tareas"
  //                del detalle.
  // "Terminadas" = # tareas de la junta con estado='completado'. Se mide
  //                directo de tasks.estado (no se exige un task_update
  //                porque la migración desde Coda trajo 1100+ tareas
  //                completadas sin updates históricos — exigir update
  //                dejaba la columna en ceros).
  const [taskAvanzadasCounts, setTaskAvanzadasCounts] = useState<Map<string, number>>(new Map());
  const [taskTerminadasCounts, setTaskTerminadasCounts] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTipo, setCreateTipo] = useState('');
  const [createFechaHora, setCreateFechaHora] = useState('');
  const [createTitulo, setCreateTitulo] = useState('');
  const [tituloOverridden, setTituloOverridden] = useState(false);

  const fetchJuntas = useCallback(async () => {
    const [jRes, aRes, tRes, uRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('juntas')
        .select('*')
        .eq('empresa_id', EMPRESA_ID)
        .order('fecha_hora', { ascending: false }),
      supabase
        .schema('erp')
        .from('juntas_asistencia')
        .select('junta_id')
        .eq('empresa_id', EMPRESA_ID),
      supabase
        .schema('erp')
        .from('tasks')
        .select('id, entidad_id, estado')
        .eq('empresa_id', EMPRESA_ID)
        .eq('entidad_tipo', 'junta')
        .limit(50000),
      // task_updates para todas las tareas de junta de la empresa. Se hace un
      // !inner join con tasks para poder filtrar por entidad_tipo='junta' y
      // obtener la junta_id sin un segundo round-trip. Límite alto para que
      // no se corte con el default de 1000 filas de PostgREST.
      supabase
        .schema('erp')
        .from('task_updates')
        .select('task_id, tasks!inner(entidad_id, entidad_tipo)')
        .eq('empresa_id', EMPRESA_ID)
        .eq('tasks.entidad_tipo', 'junta')
        .limit(50000),
    ]);
    if (jRes.error) {
      setError(jRes.error.message);
      return;
    }
    setJuntas((jRes.data ?? []) as Junta[]);

    const aCounts = new Map<string, number>();
    (aRes.data ?? []).forEach((a: { junta_id: string }) => {
      aCounts.set(a.junta_id, (aCounts.get(a.junta_id) ?? 0) + 1);
    });
    setAsistenciaCounts(aCounts);

    // Map task_id → junta_id + total de tareas por junta + tally de
    // terminadas (estado='completado') directamente desde erp.tasks.
    const taskToJunta = new Map<string, string>();
    const tCounts = new Map<string, number>();
    const teCounts = new Map<string, number>();
    (tRes.data ?? []).forEach(
      (t: { id: string; entidad_id: string | null; estado: string | null }) => {
        if (!t.entidad_id) return;
        taskToJunta.set(t.id, t.entidad_id);
        tCounts.set(t.entidad_id, (tCounts.get(t.entidad_id) ?? 0) + 1);
        if (t.estado === 'completado') {
          teCounts.set(t.entidad_id, (teCounts.get(t.entidad_id) ?? 0) + 1);
        }
      }
    );
    setTaskCounts(tCounts);
    setTaskTerminadasCounts(teCounts);

    // Avanzadas = # tareas distintas con ≥1 task_update durante la junta
    // (cruzan en la sección "Actualizaciones de tareas" del detalle). Uso
    // Set<task_id> para no duplicar cuando una tarea tiene varios updates.
    const avanzadasPerJunta = new Map<string, Set<string>>();
    (uRes.data ?? []).forEach((u: { task_id: string }) => {
      const juntaId = taskToJunta.get(u.task_id);
      if (!juntaId) return;
      let aSet = avanzadasPerJunta.get(juntaId);
      if (!aSet) {
        aSet = new Set<string>();
        avanzadasPerJunta.set(juntaId, aSet);
      }
      aSet.add(u.task_id);
    });
    const avCounts = new Map<string, number>();
    for (const [j, s] of avanzadasPerJunta) avCounts.set(j, s.size);
    setTaskAvanzadasCounts(avCounts);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await fetchJuntas();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchJuntas]);

  const openCreateSheet = () => {
    const now = nowDatetimeLocal();
    setCreateTipo('');
    setCreateFechaHora(now);
    setCreateTitulo('');
    setTituloOverridden(false);
    setShowCreate(true);
  };

  useEffect(() => {
    if (!tituloOverridden && createTipo && createFechaHora) {
      setCreateTitulo(generateTitulo(createFechaHora, createTipo));
    }
  }, [createTipo, createFechaHora, tituloOverridden]);

  const handleCreate = async () => {
    if (!createTipo || !createFechaHora) return;
    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    const titulo = createTitulo.trim() || generateTitulo(createFechaHora, createTipo);
    const { data: newJunta, error: err } = await supabase
      .schema('erp')
      .from('juntas')
      .insert({
        empresa_id: EMPRESA_ID,
        titulo,
        fecha_hora: createFechaHora,
        lugar: null,
        duracion_minutos: 60,
        tipo: createTipo,
        estado: 'en_curso',
        creado_por: coreUser?.id ?? null,
      })
      .select()
      .single();

    setCreating(false);
    if (err) {
      alert(`Error al crear junta: ${err.message}`);
      return;
    }
    setShowCreate(false);
    if (newJunta) router.push(`/dilesa/admin/juntas/${newJunta.id}`);
  };

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    juntas.forEach((j) => {
      const d = new Date(j.fecha_hora);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return [...months].sort().reverse();
  }, [juntas]);

  const filtered = juntas.filter((j) => {
    if (search) {
      const needle = search.toLowerCase();
      // Busca en título + en el texto plano de la descripción (quitando
      // tags HTML). Es la conducta previa a los refactors recientes —
      // algunos titulos son fechas "2024-11-05 ..." y el contenido real
      // vive en descripcion.
      const haystack =
        j.titulo.toLowerCase() +
        '\n' +
        (j.descripcion ? j.descripcion.replace(/<[^>]+>/g, ' ').toLowerCase() : '');
      if (!haystack.includes(needle)) return false;
    }
    if (filterEstado !== 'all' && j.estado !== filterEstado) return false;
    if (filterTipo !== 'all' && j.tipo !== filterTipo) return false;
    if (filterMonth !== 'all') {
      const d = new Date(j.fecha_hora);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (ym !== filterMonth) return false;
    }
    return true;
  });

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('fecha_hora', 'desc');
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Juntas — DILESA</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Agenda y minutas de juntas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setLoading(true);
              await fetchJuntas();
              setLoading(false);
            }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={openCreateSheet}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Crear nueva junta
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input
              placeholder="Buscar juntas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <FilterCombobox
            value={filterEstado}
            onChange={setFilterEstado}
            options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
              id: k,
              label: v.label,
            }))}
            placeholder="Estado"
            searchPlaceholder="Buscar estado..."
            clearLabel="Todos los estados"
            className="w-40"
          />
          <FilterCombobox
            value={filterTipo}
            onChange={setFilterTipo}
            options={TIPO_OPTIONS.map((t) => ({
              id: t.value,
              label: `${t.icon} ${t.label}`,
            }))}
            placeholder="Tipo"
            searchPlaceholder="Buscar tipo..."
            clearLabel="Todos los tipos"
            className="w-40"
          />
          <FilterCombobox
            value={filterMonth}
            onChange={setFilterMonth}
            options={monthOptions.map<FilterComboboxOption>((m) => {
              const [y, mo] = m.split('-');
              const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-MX', {
                month: 'long',
                year: 'numeric',
              });
              return { id: m, label: label.charAt(0).toUpperCase() + label.slice(1) };
            })}
            placeholder="Mes"
            searchPlaceholder="Buscar mes..."
            clearLabel="Todos los meses"
            className="w-40"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {juntas.length === 0
                ? 'No hay juntas registradas aún'
                : 'No hay juntas que coincidan con los filtros'}
            </p>
            {juntas.length === 0 && (
              <Button
                size="sm"
                onClick={openCreateSheet}
                className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Crear primera junta
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead
                  sortKey="titulo"
                  label="Título"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="tipo"
                  label="Tipo"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-24"
                />
                <SortableHead
                  sortKey="estado"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-28"
                />
                <SortableHead
                  sortKey="fecha_hora"
                  label="Fecha y hora"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-48"
                />
                {/* TEMP column to side-by-side compare with Coda during image
                    backfill. Remove once post-2024 juntas are pasted over. */}
                <TableHead className="min-w-[320px] max-w-[560px]">Contenido</TableHead>
                <SortableHead
                  sortKey="asistentes"
                  label="Asist."
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-16"
                />
                <SortableHead
                  sortKey="tareas"
                  label="Tareas"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-16"
                />
                <SortableHead
                  sortKey="avanzadas"
                  label="Avanz."
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-16"
                />
                <SortableHead
                  sortKey="terminadas"
                  label="Term."
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-16"
                />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(
                filtered.map((j) => ({
                  ...j,
                  asistentes: asistenciaCounts.get(j.id) ?? 0,
                  tareas: taskCounts.get(j.id) ?? 0,
                  avanzadas: taskAvanzadasCounts.get(j.id) ?? 0,
                  terminadas: taskTerminadasCounts.get(j.id) ?? 0,
                }))
              ).map((junta) => (
                <TableRow
                  key={junta.id}
                  className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]"
                  onClick={() => router.push(`/dilesa/admin/juntas/${junta.id}`)}
                >
                  <TableCell>
                    <span className="line-clamp-1 font-medium text-[var(--text)]">
                      {junta.titulo}
                    </span>
                  </TableCell>
                  <TableCell>
                    {junta.tipo ? (
                      <span className="text-sm text-[var(--text)]/70">
                        {TIPO_CONFIG[junta.tipo]?.icon}{' '}
                        {TIPO_CONFIG[junta.tipo]?.label ?? junta.tipo}
                      </span>
                    ) : (
                      <span className="text-[var(--text)]/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EstadoBadge estado={junta.estado} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">
                      {formatDateTime(junta.fecha_hora)}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[320px] max-w-[560px]">
                    <JuntaContentPreview descripcion={junta.descripcion} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/60">
                      {asistenciaCounts.get(junta.id) ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/60">
                      {taskCounts.get(junta.id) ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const n = taskAvanzadasCounts.get(junta.id) ?? 0;
                      return (
                        <span
                          className={`text-sm ${n > 0 ? 'text-blue-400 font-medium' : 'text-[var(--text)]/30'}`}
                        >
                          {n}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const n = taskTerminadasCounts.get(junta.id) ?? 0;
                      return (
                        <span
                          className={`text-sm ${n > 0 ? 'text-green-400 font-medium' : 'text-[var(--text)]/30'}`}
                        >
                          {n}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-[var(--text)]/30" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && juntas.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {filtered.length} de {juntas.length} {juntas.length === 1 ? 'junta' : 'juntas'}
        </p>
      )}

      <Sheet
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) setShowCreate(false);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-md border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-[var(--text)] text-lg">Nueva Junta</SheetTitle>
            <SheetDescription className="text-[var(--text)]/50">
              Selecciona el tipo de junta para iniciar
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-4">
            <div>
              <FieldLabel>Tipo de Junta *</FieldLabel>
              <Select value={createTipo} onValueChange={(v) => setCreateTipo(v ?? '')}>
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel>Fecha y hora</FieldLabel>
              <Input
                type="datetime-local"
                value={createFechaHora}
                onChange={(e) => setCreateFechaHora(e.target.value)}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Título</FieldLabel>
              <Input
                placeholder="Se genera automáticamente..."
                value={createTitulo}
                onChange={(e) => {
                  setCreateTitulo(e.target.value);
                  setTituloOverridden(true);
                }}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
              <p className="mt-1 text-[10px] text-[var(--text)]/40">
                Se genera como &quot;fecha, hora - tipo&quot;. Puedes editarlo si quieres.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createTipo || !createFechaHora}
              className="flex-1 gap-1.5 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Iniciar Junta
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <JuntasInner />
    </RequireAccess>
  );
}
