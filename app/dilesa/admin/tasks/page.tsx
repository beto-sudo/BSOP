'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, RefreshCw, Loader2, TicketCheck, Trash2 } from 'lucide-react';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

type ErpTask = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  asignado_a: string | null;
  asignado_por: string | null;
  creado_por: string | null;
  prioridad_id: string | null;
  estado: 'pendiente' | 'en_progreso' | 'bloqueado' | 'completado' | 'cancelado';
  fecha_vence: string | null;
  fecha_compromiso: string | null;
  fecha_completado: string | null;
  completado_por: string | null;
  porcentaje_avance: number;
  entidad_tipo: string | null;
  entidad_id: string | null;
  tipo: string | null;
  motivo_bloqueo: string | null;
  siguiente_accion: string | null;
  iniciativa: string | null;
  departamento_nombre: string | null;
  prioridad: string | null;
  created_at: string;
  updated_at: string | null;
};

type Prioridad = { id: string; nombre: string; peso: number; color: string };
type Empleado = { id: string; nombre: string };

type CreateForm = {
  titulo: string;
  descripcion: string;
  prioridad_id: string;
  asignado_a: string;
  estado: ErpTask['estado'];
  fecha_vence: string;
  porcentaje_avance: number;
};

const ESTADO_CONFIG: Record<ErpTask['estado'], { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado:   { label: 'Bloqueado',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado:  { label: 'Completado',  cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]' },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EstadoBadge({ estado }: { estado: ErpTask['estado'] }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, cls: '' };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
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

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped === 100 ? 'bg-green-500' : clamped >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-[var(--text)]/50">{clamped}%</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

function TasksInner() {
  const supabase = createSupabaseERPClient();

  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState<string | null>(null);
  const [isDireccion, setIsDireccion] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tasks, setTasks] = useState<ErpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterPrioridad, setFilterPrioridad] = useState('all');
  const [filterAsignado, setFilterAsignado] = useState('all');
  const [filterDepto, setFilterDepto] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    titulo: '',
    descripcion: '',
    prioridad_id: '',
    asignado_a: '',
    estado: 'pendiente',
    fecha_vence: '',
    porcentaje_avance: 0,
  });

  const [showEdit, setShowEdit] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [editForm, setEditForm] = useState<CreateForm>({
    titulo: '',
    descripcion: '',
    prioridad_id: '',
    asignado_a: '',
    estado: 'pendiente',
    fecha_vence: '',
    porcentaje_avance: 0,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRefData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? '';

    const [priRes, empRes, coreUserRes] = await Promise.all([
      supabase.schema('shared' as any).from('prioridades').select('*').order('peso'),
      supabase.schema('erp' as any).from('empleados')
        .select('id, persona:persona_id(nombre, apellido_paterno)')
        .eq('empresa_id', EMPRESA_ID).eq('activo', true).is('deleted_at', null),
      supabase.schema('core' as any).from('usuarios')
        .select('id, rol').eq('email', email).maybeSingle(),
    ]);

    setPrioridades(priRes.data ?? []);
    const mappedEmpleados = (empRes.data ?? []).map((e: any) => ({
      id: e.id,
      nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
    }));
    setEmpleados(mappedEmpleados);

    if (coreUserRes.data?.rol === 'admin') {
      setIsAdmin(true);
      setIsDireccion(true);
    }

    // Find current user's empleado_id and role
    if (email) {
      const { data: persona } = await supabase
        .schema('erp' as any)
        .from('personas')
        .select('id')
        .eq('empresa_id', EMPRESA_ID)
        .eq('email', email)
        .maybeSingle();

      if (persona) {
        const { data: empleado } = await supabase
          .schema('erp' as any)
          .from('empleados')
          .select('id')
          .eq('empresa_id', EMPRESA_ID)
          .eq('persona_id', persona.id)
          .eq('activo', true)
          .maybeSingle();

        if (empleado) setCurrentEmpleadoId(empleado.id);
      }

      // Check if user has direccion role for this empresa
      if (!coreUserRes.data || coreUserRes.data.rol !== 'admin') {
        const { data: ue } = await supabase
          .schema('core' as any)
          .from('usuarios_empresas')
          .select('rol_id')
          .eq('usuario_id', coreUserRes.data?.id ?? '')
          .eq('empresa_id', EMPRESA_ID)
          .eq('activo', true)
          .maybeSingle();

        if (ue?.rol_id) {
          const { data: role } = await supabase
            .schema('core' as any)
            .from('roles')
            .select('nombre')
            .eq('id', ue.rol_id)
            .maybeSingle();

          if (role?.nombre?.toLowerCase() === 'direccion' || role?.nombre?.toLowerCase() === 'dirección') {
            setIsDireccion(true);
          }
        }
      }
    }
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); return; }
    setTasks(data ?? []);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await fetchRefData();
      if (cancelled) return;
      await fetchTasks();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [fetchRefData, fetchTasks]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchTasks();
    setLoading(false);
  };

  const resetForm = (): CreateForm => ({
    titulo: '', descripcion: '', prioridad_id: '', asignado_a: '',
    estado: 'pendiente', fecha_vence: '', porcentaje_avance: 0,
  });

  const handleCreate = async () => {
    if (!createForm.titulo.trim()) return;
    setCreating(true);

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .insert({
        empresa_id: EMPRESA_ID,
        titulo: createForm.titulo.trim(),
        descripcion: createForm.descripcion.trim() || null,
        prioridad_id: createForm.prioridad_id || null,
        asignado_a: createForm.asignado_a || null,
        asignado_por: currentEmpleadoId,
        estado: createForm.estado,
        fecha_vence: createForm.fecha_vence || null,
        porcentaje_avance: createForm.porcentaje_avance,
      });

    setCreating(false);
    if (err) { alert(`Error al crear tarea: ${err.message}`); return; }
    setShowCreate(false);
    setCreateForm(resetForm());
    await fetchTasks();
  };

  const openEdit = (task: ErpTask) => {
    setSelectedTask(task);
    setEditForm({
      titulo: task.titulo,
      descripcion: task.descripcion ?? '',
      prioridad_id: task.prioridad_id ?? '',
      asignado_a: task.asignado_a ?? '',
      estado: task.estado,
      fecha_vence: task.fecha_vence ? task.fecha_vence.split('T')[0] : '',
      porcentaje_avance: task.porcentaje_avance ?? 0,
    });
    setShowEdit(true);
  };

  const canModifyTask = useCallback((task: ErpTask | null) => {
    if (!task) return false;
    if (isAdmin || isDireccion) return true;
    if (task.asignado_por === currentEmpleadoId) return true;
    return false;
  }, [isAdmin, isDireccion, currentEmpleadoId]);

  const canCompleteTask = useCallback((task: ErpTask | null) => {
    if (!task) return false;
    if (isAdmin || isDireccion) return true;
    // Creator can always complete their own tasks
    if (task.asignado_por === currentEmpleadoId) return true;
    // Assignee can complete if they are also the creator (self-assigned)
    if (!task.asignado_por && task.asignado_a === currentEmpleadoId) return true;
    return false;
  }, [isAdmin, isDireccion, currentEmpleadoId]);

  const handleUpdate = async () => {
    if (!selectedTask || !editForm.titulo.trim()) return;
    setSaving(true);

    const updatePayload: Record<string, unknown> = {
      titulo: editForm.titulo.trim(),
      descripcion: editForm.descripcion.trim() || null,
      prioridad_id: editForm.prioridad_id || null,
      asignado_a: editForm.asignado_a || null,
      fecha_vence: editForm.fecha_vence || null,
      porcentaje_avance: editForm.porcentaje_avance,
    };

    if (canCompleteTask(selectedTask)) {
      updatePayload.estado = editForm.estado;
      if (editForm.estado === 'completado' && selectedTask.estado !== 'completado') {
        updatePayload.completado_por = currentEmpleadoId;
      }
    }

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .update(updatePayload)
      .eq('id', selectedTask.id);

    setSaving(false);
    if (err) { alert(`Error al guardar tarea: ${err.message}`); return; }
    setShowEdit(false);
    setSelectedTask(null);
    await fetchTasks();
  };

  const handleDelete = async () => {
    if (!selectedTask || !canModifyTask(selectedTask)) return;
    if (!confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
    setDeleting(true);

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .delete()
      .eq('id', selectedTask.id);

    setDeleting(false);
    if (err) { alert(`Error al eliminar: ${err.message}`); return; }
    setShowEdit(false);
    setSelectedTask(null);
    await fetchTasks();
  };

  const empleadoMap = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const prioridadMap = useMemo(() => new Map(prioridades.map((p) => [p.id, p])), [prioridades]);

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<ErpTask & { prioridad_peso: number | null; asignado_nombre: string | null }>('created_at', 'desc');

  // Visibility filter: only own tasks unless direccion/admin
  const visibleTasks = useMemo(() => {
    if (isAdmin || isDireccion) return tasks;
    return tasks.filter((t) =>
      t.asignado_a === currentEmpleadoId ||
      t.asignado_por === currentEmpleadoId ||
      t.creado_por === currentEmpleadoId,
    );
  }, [tasks, isAdmin, isDireccion, currentEmpleadoId]);

  const filtered = visibleTasks.filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (!t.titulo.toLowerCase().includes(s) &&
          !t.descripcion?.toLowerCase().includes(s) &&
          !t.departamento_nombre?.toLowerCase().includes(s) &&
          !t.iniciativa?.toLowerCase().includes(s)) return false;
    }
    if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'all' && t.prioridad_id !== filterPrioridad) return false;
    if (filterAsignado !== 'all' && t.asignado_a !== filterAsignado) return false;
    if (filterDepto !== 'all' && t.departamento_nombre !== filterDepto) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Tareas — DILESA</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Gestión de tareas operativas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5">
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input placeholder="Buscar tareas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
          </div>
          <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterPrioridad} onValueChange={(v) => setFilterPrioridad(v ?? 'all')}>
            <SelectTrigger className="w-36 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {prioridades.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterAsignado} onValueChange={(v) => setFilterAsignado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Asignado a" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {empleados.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={filterDepto} onValueChange={(v) => setFilterDepto(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Depto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {[...new Set(tasks.map(t => t.departamento_nombre).filter(Boolean))].sort().map(d => (
                <SelectItem key={d!} value={d!}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="space-y-0 divide-y divide-[var(--border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-4 w-64" /><Skeleton className="h-5 w-20 ml-auto" /><Skeleton className="h-5 w-20" /><Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <TicketCheck className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {visibleTasks.length === 0 ? 'No hay tareas creadas aún' : 'No hay tareas que coincidan con los filtros'}
            </p>
            {visibleTasks.length === 0 && (
              <Button size="sm" onClick={() => setShowCreate(true)} className="mt-4 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90">
                <Plus className="h-4 w-4" />Crear primera tarea
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="titulo" label="Título" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="departamento_nombre" label="Depto" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
                <SortableHead sortKey="estado" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="porcentaje_avance" label="Avance" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
                <SortableHead sortKey="asignado_nombre" label="Responsable" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
                <SortableHead sortKey="created_at" label="Fecha Tarea" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="fecha_compromiso" label="Compromiso" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <SortableHead sortKey="iniciativa" label="Iniciativa" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered.map((t) => ({ ...t, prioridad_peso: prioridadMap.get(t.prioridad_id ?? '')?.peso ?? null, asignado_nombre: empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null }))).map((task) => {
                const prio = prioridadMap.get(task.prioridad_id ?? '');
                const empleado = empleadoMap.get(task.asignado_a ?? '');
                return (
                  <TableRow key={task.id} className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]" onClick={() => openEdit(task)}>
                    <TableCell>
                      <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
                      {task.descripcion && (<span className="mt-0.5 block text-xs text-[var(--text)]/40 line-clamp-1">{task.descripcion}</span>)}
                    </TableCell>
                    <TableCell><span className="text-xs text-[var(--text)]/60">{task.departamento_nombre || '—'}</span></TableCell>
                    <TableCell><EstadoBadge estado={task.estado} /></TableCell>
                    <TableCell><ProgressBar value={task.porcentaje_avance ?? 0} /></TableCell>
                    <TableCell><span className="text-sm text-[var(--text)]/70">{empleado ? empleado.nombre : '—'}</span></TableCell>
                    <TableCell><span className="text-xs text-[var(--text)]/60">{formatDate(task.created_at)}</span></TableCell>
                    <TableCell><span className="text-xs text-[var(--text)]/60">{formatDate(task.fecha_compromiso)}</span></TableCell>
                    <TableCell><span className="text-xs text-[var(--text)]/60">{task.iniciativa || '—'}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && visibleTasks.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">{filtered.length} de {visibleTasks.length} {visibleTasks.length === 1 ? 'tarea' : 'tareas'}</p>
      )}

      {/* ── Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showEdit} onOpenChange={(open) => { setShowEdit(open); if (!open) setSelectedTask(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader><DialogTitle className="text-[var(--text)]">Editar Tarea</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><FieldLabel>Título *</FieldLabel><Input placeholder="Descripción breve de la tarea..." value={editForm.titulo} onChange={(e) => setEditForm((f) => ({ ...f, titulo: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div><FieldLabel>Descripción</FieldLabel><Textarea placeholder="Detalla la tarea..." value={editForm.descripcion} onChange={(e) => setEditForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Select
                  value={editForm.estado}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, estado: v as ErpTask['estado'] }))}
                  disabled={!canCompleteTask(selectedTask)}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ESTADO_CONFIG).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}</SelectContent>
                </Select>
                {!canCompleteTask(selectedTask) && (
                  <p className="mt-1 text-[10px] text-[var(--text)]/40">Solo dirección o el creador pueden cambiar el estado</p>
                )}
              </div>
              <div><FieldLabel>Prioridad</FieldLabel><Select value={editForm.prioridad_id} onValueChange={(v) => setEditForm((f) => ({ ...f, prioridad_id: v ?? '' }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Sin prioridad" /></SelectTrigger><SelectContent>{prioridades.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>))}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Asignado a</FieldLabel><Select value={editForm.asignado_a} onValueChange={(v) => setEditForm((f) => ({ ...f, asignado_a: v ?? '' }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{empleados.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>))}</SelectContent></Select></div>
              <div><FieldLabel>Fecha límite</FieldLabel><Input type="date" value={editForm.fecha_vence} onChange={(e) => setEditForm((f) => ({ ...f, fecha_vence: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            </div>
            <div>
              <FieldLabel>Avance ({editForm.porcentaje_avance}%)</FieldLabel>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={editForm.porcentaje_avance}
                onChange={(e) => setEditForm((f) => ({ ...f, porcentaje_avance: Number(e.target.value) }))}
                className="w-full accent-[var(--accent)]"
              />
            </div>

            {/* Metadatos adicionales (Read-only) */}
            {(selectedTask?.departamento_nombre || selectedTask?.iniciativa || selectedTask?.prioridad || selectedTask?.tipo) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-[var(--panel)] p-3 border border-[var(--border)] text-[11px]">
                {selectedTask.departamento_nombre && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Depto</span> {selectedTask.departamento_nombre}</div>
                )}
                {selectedTask.iniciativa && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Iniciativa</span> {selectedTask.iniciativa}</div>
                )}
                {selectedTask.prioridad && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Prioridad (Original)</span> {selectedTask.prioridad}</div>
                )}
                {selectedTask.tipo && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Tipo</span> {selectedTask.tipo}</div>
                )}
                {selectedTask.fecha_compromiso && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Compromiso</span> {formatDate(selectedTask.fecha_compromiso)}</div>
                )}
                {selectedTask.motivo_bloqueo && (
                  <div className="col-span-2"><span className="font-semibold text-[var(--text)]/40 block">Bloqueo</span> {selectedTask.motivo_bloqueo}</div>
                )}
                {selectedTask.siguiente_accion && (
                  <div className="col-span-2"><span className="font-semibold text-[var(--text)]/40 block">Siguiente Acción</span> {selectedTask.siguiente_accion}</div>
                )}
              </div>
            )}

            {selectedTask?.asignado_por && (
              <div className="text-xs text-[var(--text)]/40">
                Asignada por: {empleadoMap.get(selectedTask.asignado_por)?.nombre ?? 'Desconocido'}
                {selectedTask.fecha_completado && (
                  <> · Completada: {formatDate(selectedTask.fecha_completado)}</>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {canModifyTask(selectedTask) && (
              <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting} className="mr-auto rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setShowEdit(false); setSelectedTask(null); }} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">Cancelar</Button>
            <Button onClick={handleUpdate} disabled={saving || !editForm.titulo.trim()} className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader><DialogTitle className="text-[var(--text)]">Nueva Tarea</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><FieldLabel>Título *</FieldLabel><Input placeholder="Descripción breve de la tarea..." value={createForm.titulo} onChange={(e) => setCreateForm((f) => ({ ...f, titulo: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div><FieldLabel>Descripción</FieldLabel><Textarea placeholder="Detalla la tarea..." value={createForm.descripcion} onChange={(e) => setCreateForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Estado</FieldLabel><Select value={createForm.estado} onValueChange={(v) => setCreateForm((f) => ({ ...f, estado: v as ErpTask['estado'] }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ESTADO_CONFIG).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}</SelectContent></Select></div>
              <div><FieldLabel>Prioridad</FieldLabel><Select value={createForm.prioridad_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, prioridad_id: v ?? '' }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Sin prioridad" /></SelectTrigger><SelectContent>{prioridades.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>))}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Asignado a</FieldLabel><Select value={createForm.asignado_a} onValueChange={(v) => setCreateForm((f) => ({ ...f, asignado_a: v ?? '' }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Sin asignar" /></SelectTrigger><SelectContent>{empleados.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>))}</SelectContent></Select></div>
              <div><FieldLabel>Fecha límite</FieldLabel><Input type="date" value={createForm.fecha_vence} onChange={(e) => setCreateForm((f) => ({ ...f, fecha_vence: e.target.value }))} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreateForm(resetForm()); }} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !createForm.titulo.trim()} className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <TasksInner />
    </RequireAccess>
  );
}
