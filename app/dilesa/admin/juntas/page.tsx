'use client';

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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw, Loader2, CalendarDays, ChevronRight, Play } from 'lucide-react';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

type Junta = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  fecha_hora: string;
  duracion_minutos: number | null;
  lugar: string | null;
  estado: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  tipo: string | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string | null;
};

const ESTADO_CONFIG: Record<Junta['estado'], { label: string; cls: string }> = {
  programada:  { label: 'Programada',  cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  en_curso:    { label: 'En curso',    cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  completada:  { label: 'Completada',  cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]' },
  cancelada:   { label: 'Cancelada',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

const TIPO_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'Comité Ejecutivo',             label: 'Comité Ejecutivo',             icon: '👔' },
  { value: 'Consejo',                      label: 'Consejo',                      icon: '🏢' },
  { value: 'Ventas',                       label: 'Ventas',                       icon: '💰' },
  { value: 'Atención PosVenta',            label: 'Atención PosVenta',            icon: '🔧' },
  { value: 'Administración',               label: 'Administración',               icon: '📁' },
  { value: 'Mercadotecnia',                label: 'Mercadotecnia',                icon: '📣' },
  { value: 'Construcción',                 label: 'Construcción',                 icon: '🏗️' },
  { value: 'Compras y Admon. Inventario',  label: 'Compras y Admon. Inv.',        icon: '📦' },
  { value: 'Maquinaria',                   label: 'Maquinaria',                   icon: '🚜' },
  { value: 'Proyectos',                    label: 'Proyectos',                    icon: '🗂️' },
  { value: 'Rincón del Bosque',            label: 'Rincón del Bosque',            icon: '🌲' },
  { value: 'Extraordinaria',               label: 'Extraordinaria',               icon: '🚨' },
  { value: 'Otro',                         label: 'Otro',                         icon: '📌' },
];

const TIPO_CONFIG: Record<string, { label: string; icon: string }> = Object.fromEntries([
  ...TIPO_OPTIONS.map(t => [t.value, { label: t.label, icon: t.icon }]),
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
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function EstadoBadge({ estado }: { estado: Junta['estado'] }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">{children}</div>;
}

function nowDatetimeLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateTitulo(fechaHora: string, tipo: string) {
  if (!fechaHora || !tipo) return '';
  const d = new Date(fechaHora);
  const fecha = d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fecha}, ${hora} - ${tipo}`;
}

function JuntasInner() {
  const router = useRouter();
  const supabase = createSupabaseERPClient();

  const [juntas, setJuntas] = useState<Junta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [asistenciaCounts, setAsistenciaCounts] = useState<Map<string, number>>(new Map());
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map());
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
    const [jRes, aRes, tRes] = await Promise.all([
      supabase.schema('erp').from('juntas').select('*')
        .eq('empresa_id', EMPRESA_ID).order('fecha_hora', { ascending: false }),
      supabase.schema('erp').from('juntas_asistencia').select('junta_id')
        .eq('empresa_id', EMPRESA_ID),
      supabase.schema('erp').from('tasks').select('entidad_id')
        .eq('empresa_id', EMPRESA_ID).eq('entidad_tipo', 'junta'),
    ]);
    if (jRes.error) { setError(jRes.error.message); return; }
    setJuntas((jRes.data ?? []) as Junta[]);
    const aCounts = new Map<string, number>();
    (aRes.data ?? []).forEach((a: { junta_id: string }) => {
      aCounts.set(a.junta_id, (aCounts.get(a.junta_id) ?? 0) + 1);
    });
    setAsistenciaCounts(aCounts);
    const tCounts = new Map<string, number>();
    (tRes.data ?? []).forEach((t: { entidad_id: string | null }) => {
      if (t.entidad_id) tCounts.set(t.entidad_id, (tCounts.get(t.entidad_id) ?? 0) + 1);
    });
    setTaskCounts(tCounts);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const init = async () => {
      await fetchJuntas();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
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
    const { data: { user } } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase.schema('core').from('usuarios').select('id').eq('email', (user?.email ?? '').toLowerCase()).maybeSingle();

    const titulo = createTitulo.trim() || generateTitulo(createFechaHora, createTipo);
    const { data: newJunta, error: err } = await supabase
      .schema('erp').from('juntas').insert({
        empresa_id: EMPRESA_ID,
        titulo,
        fecha_hora: createFechaHora,
        lugar: null,
        duracion_minutos: 60,
        tipo: createTipo,
        estado: 'en_curso',
        creado_por: coreUser?.id ?? null,
      }).select().single();

    setCreating(false);
    if (err) { alert(`Error al crear junta: ${err.message}`); return; }
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
    if (search && !j.titulo.toLowerCase().includes(search.toLowerCase())) return false;
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
          <Button variant="outline" size="sm" onClick={async () => { setLoading(true); await fetchJuntas(); setLoading(false); }} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreateSheet} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5">
            <Plus className="h-4 w-4" />Crear nueva junta
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input placeholder="Buscar juntas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
          </div>
          <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={(v) => setFilterTipo(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TIPO_OPTIONS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Mes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {monthOptions.map((m) => {
                const [y, mo] = m.split('-');
                const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
                return <SelectItem key={m} value={m}>{label.charAt(0).toUpperCase() + label.slice(1)}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4"><Skeleton className="h-4 w-64" /><Skeleton className="h-5 w-20 ml-auto" /><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-32" /></div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <CalendarDays className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">{juntas.length === 0 ? 'No hay juntas registradas aún' : 'No hay juntas que coincidan con los filtros'}</p>
            {juntas.length === 0 && (
              <Button size="sm" onClick={openCreateSheet} className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"><Plus className="h-4 w-4" />Crear primera junta</Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="tipo" label="Tipo" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
                <SortableHead sortKey="estado" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="fecha_hora" label="Fecha y hora" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-48" />
                <SortableHead sortKey="asistentes" label="Asist." currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-16" />
                <SortableHead sortKey="tareas" label="Tareas" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-16" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered.map((j) => ({ ...j, asistentes: asistenciaCounts.get(j.id) ?? 0, tareas: taskCounts.get(j.id) ?? 0 }))).map((junta) => (
                <TableRow key={junta.id} className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]" onClick={() => router.push(`/dilesa/admin/juntas/${junta.id}`)}>
                  <TableCell><span className="line-clamp-1 font-medium text-[var(--text)]">{junta.titulo}</span></TableCell>
                  <TableCell>
                    {junta.tipo ? (<span className="text-sm text-[var(--text)]/70">{TIPO_CONFIG[junta.tipo]?.icon} {TIPO_CONFIG[junta.tipo]?.label ?? junta.tipo}</span>) : (<span className="text-[var(--text)]/40">—</span>)}
                  </TableCell>
                  <TableCell><EstadoBadge estado={junta.estado} /></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/70">{formatDateTime(junta.fecha_hora)}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/60">{asistenciaCounts.get(junta.id) ?? 0}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/60">{taskCounts.get(junta.id) ?? 0}</span></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-[var(--text)]/30" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && juntas.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">{filtered.length} de {juntas.length} {juntas.length === 1 ? 'junta' : 'juntas'}</p>
      )}

      <Sheet open={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-md border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto">
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
                    <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
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
                onChange={(e) => { setCreateTitulo(e.target.value); setTituloOverridden(true); }}
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
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
