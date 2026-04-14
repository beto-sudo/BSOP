'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  Loader2,
  TicketCheck,
  Bug,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  empresa_id: string;
  kind: 'task' | 'bug' | 'feature' | 'request';
  titulo: string;
  descripcion: string | null;
  prioridad_id: string | null;
  categoria_id: string | null;
  estado_id: string | null;
  creador_id: string | null;
  responsable_id: string | null;
  fecha_limite: string | null;
  fecha_resolucion: string | null;
  severidad: string | null;
  modulo: string | null;
  url_referencia: string | null;
  created_at: string;
  updated_at: string;
};

type Prioridad = { id: string; nombre: string; peso: number; color: string };
type Estado = { id: string; nombre: string; tipo: string; color: string; orden: number };
type Categoria = { id: string; nombre: string; icono: string | null };
type Usuario = { id: string; email: string; first_name: string | null };

type CreateForm = {
  titulo: string;
  descripcion: string;
  kind: 'task' | 'bug' | 'feature' | 'request';
  prioridad_id: string;
  categoria_id: string;
  estado_id: string;
  responsable_id: string;
  fecha_limite: string;
  severidad: string;
  modulo: string;
  url_referencia: string;
};

// ─── Kind config ──────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  task: {
    label: 'Tarea',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    icon: <TicketCheck className="h-3 w-3" />,
  },
  bug: {
    label: 'Bug',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
    icon: <Bug className="h-3 w-3" />,
  },
  feature: {
    label: 'Feature',
    cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    icon: <Sparkles className="h-3 w-3" />,
  },
  request: {
    label: 'Solicitud',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    icon: <MessageSquare className="h-3 w-3" />,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Badge components ─────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const cfg = KIND_CONFIG[kind] ?? {
    label: kind,
    cls: 'bg-[var(--border)] text-[var(--text)]/70 border-[var(--border)]',
    icon: null,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function PrioridadBadge({ prioridad }: { prioridad: Prioridad | undefined }) {
  if (!prioridad) return <span className="text-[var(--text)]/40">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `${prioridad.color}25`,
        color: prioridad.color,
        borderColor: `${prioridad.color}35`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: prioridad.color }} />
      {prioridad.nombre}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: Estado | undefined }) {
  if (!estado) return <span className="text-[var(--text)]/40">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `${estado.color}25`,
        color: estado.color,
        borderColor: `${estado.color}35`,
      }}
    >
      {estado.nombre}
    </span>
  );
}

// ─── Field label ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function TasksInner() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // Reference data
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Task data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterPrioridad, setFilterPrioridad] = useState('all');
  const [filterResponsable, setFilterResponsable] = useState('all');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    titulo: '',
    descripcion: '',
    kind: 'task',
    prioridad_id: '',
    categoria_id: '',
    estado_id: '',
    responsable_id: '',
    fecha_limite: '',
    severidad: '',
    modulo: '',
    url_referencia: '',
  });

  const fetchRefData = useCallback(async () => {
    const [priRes, estRes, catRes] = await Promise.all([
      supabase.schema('shared' as any).from('prioridades').select('*').order('peso'),
      supabase.schema('shared' as any).from('estados').select('*').order('orden'),
      supabase.schema('shared' as any).from('categorias').select('*').order('nombre'),
    ]);
    setPrioridades(priRes.data ?? []);
    setEstados(estRes.data ?? []);
    setCategorias(catRes.data ?? []);
  }, [supabase]);

  const fetchEmpresaAndUsers = useCallback(async (): Promise<string | null> => {
    const { data: emp } = await supabase
      .schema('core' as any)
      .from('empresas')
      .select('id')
      .eq('slug', 'rdb')
      .single();

    if (!emp) return null;
    setEmpresaId(emp.id);

    const { data: ueData } = await supabase
      .schema('core' as any)
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('empresa_id', emp.id)
      .eq('activo', true);

    const userIds = (ueData ?? []).map((u: any) => u.usuario_id);
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .schema('core' as any)
        .from('usuarios')
        .select('id, email, first_name')
        .in('id', userIds)
        .eq('activo', true);
      setUsuarios(usersData ?? []);
    }

    return emp.id;
  }, [supabase]);

  const fetchTasks = useCallback(
    async (empId: string) => {
      const { data, error: err } = await supabase
        .schema('core' as any)
        .from('tasks')
        .select('*')
        .eq('empresa_id', empId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message);
        return;
      }
      setTasks(data ?? []);
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const init = async () => {
      await fetchRefData();
      const empId = await fetchEmpresaAndUsers();
      if (!empId || cancelled) return;
      await fetchTasks(empId);
      if (!cancelled) setLoading(false);
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchRefData, fetchEmpresaAndUsers, fetchTasks]);

  const handleRefresh = async () => {
    if (!empresaId) return;
    setLoading(true);
    await fetchTasks(empresaId);
    setLoading(false);
  };

  const resetForm = () =>
    setCreateForm({
      titulo: '',
      descripcion: '',
      kind: 'task',
      prioridad_id: '',
      categoria_id: '',
      estado_id: '',
      responsable_id: '',
      fecha_limite: '',
      severidad: '',
      modulo: '',
      url_referencia: '',
    });

  const handleCreate = async () => {
    if (!createForm.titulo.trim() || !empresaId) return;
    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    const payload: Record<string, unknown> = {
      empresa_id: empresaId,
      kind: createForm.kind,
      titulo: createForm.titulo.trim(),
      descripcion: createForm.descripcion.trim() || null,
      prioridad_id: createForm.prioridad_id || null,
      categoria_id: createForm.categoria_id || null,
      estado_id: createForm.estado_id || null,
      responsable_id: createForm.responsable_id || null,
      fecha_limite: createForm.fecha_limite || null,
      modulo: createForm.modulo.trim() || null,
      url_referencia: createForm.url_referencia.trim() || null,
      creador_id: coreUser?.id ?? null,
      severidad: createForm.kind === 'bug' ? createForm.severidad || null : null,
    };

    const { data: newTask, error: err } = await supabase
      .schema('core' as any)
      .from('tasks')
      .insert(payload)
      .select()
      .single();

    setCreating(false);

    if (err) {
      alert(`Error al crear tarea: ${err.message}`);
      return;
    }

    setShowCreate(false);
    resetForm();

    if (newTask) {
      router.push(`/rdb/tasks/${newTask.id}`);
    }
  };

  // Filtered tasks
  const filtered = tasks.filter((t) => {
    if (search && !t.titulo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterKind !== 'all' && t.kind !== filterKind) return false;
    if (filterEstado !== 'all' && t.estado_id !== filterEstado) return false;
    if (filterPrioridad !== 'all' && t.prioridad_id !== filterPrioridad) return false;
    if (filterResponsable !== 'all' && t.responsable_id !== filterResponsable) return false;
    return true;
  });

  const prioridadMap = new Map(prioridades.map((p) => [p.id, p]));
  const estadoMap = new Map(estados.map((e) => [e.id, e]));
  const usuarioMap = new Map(usuarios.map((u) => [u.id, u]));

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Task & { prioridad_nombre: string | null; responsable_nombre: string | null; estado_nombre: string | null }>('fecha_limite', 'desc');
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Tareas</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">
            Gestión de tareas, bugs, features y solicitudes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input
              placeholder="Buscar tareas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <Select value={filterKind} onValueChange={(v) => setFilterKind(v ?? 'all')}>
            <SelectTrigger className="w-36 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="task">Tarea</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="request">Solicitud</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPrioridad} onValueChange={(v) => setFilterPrioridad(v ?? 'all')}>
            <SelectTrigger className="w-36 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {prioridades.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {estados.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterResponsable} onValueChange={(v) => setFilterResponsable(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.first_name ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-16 ml-auto" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <TicketCheck className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {tasks.length === 0
                ? 'No hay tareas creadas aún'
                : 'No hay tareas que coincidan con los filtros'}
            </p>
            {tasks.length === 0 && (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Crear primera tarea
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="kind" label="Tipo" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
                <SortableHead sortKey="prioridad_nombre" label="Prioridad" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="estado_nombre" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="responsable_nombre" label="Responsable" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
                <SortableHead sortKey="fecha_limite" label="Fecha límite" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered.map((t) => ({ ...t, prioridad_nombre: prioridadMap.get(t.prioridad_id ?? '')?.nombre ?? null, responsable_nombre: (() => { const u = usuarioMap.get(t.responsable_id ?? ''); return u ? `${u.first_name ?? ''} ${u.email}`.trim() : null; })(), estado_nombre: estadoMap.get(t.estado_id ?? '')?.nombre ?? null }))).map((task) => {
                const prio = prioridadMap.get(task.prioridad_id ?? '');
                const estado = estadoMap.get(task.estado_id ?? '');
                const responsable = usuarioMap.get(task.responsable_id ?? '');
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]"
                    onClick={() => router.push(`/rdb/tasks/${task.id}`)}
                  >
                    <TableCell>
                      <span className="line-clamp-1 font-medium text-[var(--text)]">
                        {task.titulo}
                      </span>
                      {task.modulo && (
                        <span className="mt-0.5 block text-xs text-[var(--text)]/40">
                          {task.modulo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={task.kind} />
                    </TableCell>
                    <TableCell>
                      <PrioridadBadge prioridad={prio} />
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={estado} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">
                        {responsable ? (responsable.first_name ?? responsable.email) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">
                        {formatDate(task.fecha_limite)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-[var(--text)]/30" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Summary */}
      {!loading && tasks.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {filtered.length} de {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
        </p>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nueva Tarea</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Titulo */}
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                placeholder="Descripción breve del problema o tarea..."
                value={createForm.titulo}
                onChange={(e) => setCreateForm((f) => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            {/* Tipo + Severidad */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Tipo</FieldLabel>
                <Select
                  value={createForm.kind}
                  onValueChange={(v) =>
                    setCreateForm((f): CreateForm => ({ ...f, kind: (v ?? 'task') as CreateForm['kind'], severidad: '' }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Tarea</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="request">Solicitud</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createForm.kind === 'bug' ? (
                <div>
                  <FieldLabel>Severidad</FieldLabel>
                  <Select
                    value={createForm.severidad}
                    onValueChange={(v) => setCreateForm((f): CreateForm => ({ ...f, severidad: v ?? '' }))}
                  >
                    <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critica">Crítica</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <FieldLabel>Módulo</FieldLabel>
                  <Input
                    placeholder="Ej: Ventas, Inventario..."
                    value={createForm.modulo}
                    onChange={(e) => setCreateForm((f) => ({ ...f, modulo: e.target.value }))}
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  />
                </div>
              )}
            </div>

            {/* Descripcion */}
            <div>
              <FieldLabel>Descripción</FieldLabel>
              <Textarea
                placeholder="Detalla el problema, comportamiento esperado, pasos para reproducir..."
                value={createForm.descripcion}
                onChange={(e) => setCreateForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={4}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            {/* Prioridad + Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Select
                  value={createForm.prioridad_id}
                  onValueChange={(v) => setCreateForm((f): CreateForm => ({ ...f, prioridad_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prioridades.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Estado inicial</FieldLabel>
                <Select
                  value={createForm.estado_id}
                  onValueChange={(v) => setCreateForm((f): CreateForm => ({ ...f, estado_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Categoria + Responsable */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Categoría</FieldLabel>
                <Select
                  value={createForm.categoria_id}
                  onValueChange={(v) => setCreateForm((f): CreateForm => ({ ...f, categoria_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icono ? `${c.icono} ` : ''}
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Responsable</FieldLabel>
                <Select
                  value={createForm.responsable_id}
                  onValueChange={(v) => setCreateForm((f): CreateForm => ({ ...f, responsable_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.first_name ?? u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fecha limite + URL */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Fecha límite</FieldLabel>
                <Input
                  type="date"
                  value={createForm.fecha_limite}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_limite: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>URL de referencia</FieldLabel>
                <Input
                  placeholder="https://..."
                  value={createForm.url_referencia}
                  onChange={(e) => setCreateForm((f) => ({ ...f, url_referencia: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>

            {createForm.kind === 'bug' && (
              <div>
                <FieldLabel>Módulo afectado</FieldLabel>
                <Input
                  placeholder="Ej: Ventas, Inventario..."
                  value={createForm.modulo}
                  onChange={(e) => setCreateForm((f) => ({ ...f, modulo: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreate(false);
                resetForm();
              }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createForm.titulo.trim()}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.tasks">
      <TasksInner />
    </RequireAccess>
  );
}
