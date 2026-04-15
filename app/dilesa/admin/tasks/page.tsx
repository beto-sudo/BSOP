'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, RefreshCw, Loader2, TicketCheck, Trash2, Check, ChevronsUpDown, Eye, EyeOff,
} from 'lucide-react';

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

type Empleado = { id: string; nombre: string };

type TaskForm = {
  titulo: string;
  descripcion: string;
  prioridad: string;
  asignado_a: string;
  estado: ErpTask['estado'];
  fecha_compromiso: string;
  porcentaje_avance: number;
};

const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

const ESTADO_CONFIG: Record<ErpTask['estado'], { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado:   { label: 'Bloqueado',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado:  { label: 'Completado',  cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]' },
};

const ESTADO_ORDER: ErpTask['estado'][] = ['pendiente', 'en_progreso', 'bloqueado', 'completado', 'cancelado'];

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

function PrioridadTextBadge({ text }: { text: string | null }) {
  if (!text) return <span className="text-[var(--text)]/40">—</span>;
  const lower = text.toLowerCase();
  const dotColor = (lower === 'alta' || lower === 'urgente')
    ? 'bg-red-500'
    : lower === 'media'
    ? 'bg-amber-500'
    : lower === 'baja'
    ? 'bg-green-500'
    : 'bg-gray-400';
  const cls = (lower === 'alta' || lower === 'urgente')
    ? 'bg-red-500/15 text-red-400 border-red-500/20'
    : lower === 'media'
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    : lower === 'baja'
    ? 'bg-green-500/15 text-green-400 border-green-500/20'
    : 'bg-[var(--border)]/40 text-[var(--text)]/60 border-[var(--border)]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      {text}
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

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </div>
  );
}

function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Sin resultados',
  allowClear = false,
  clearLabel = 'Todos',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--text)] px-3 h-9 text-sm hover:bg-[var(--panel)]/80 transition-colors ${className ?? 'w-full'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-[var(--text)]/40'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-40" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value={`__clear__${clearLabel}`}
                  onSelect={() => { onChange('all'); setOpen(false); }}
                  data-checked={value === 'all' || value === ''}
                >
                  {clearLabel}
                </CommandItem>
              )}
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={o.label}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                  data-checked={value === o.id}
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TasksInner() {
  const supabase = createSupabaseERPClient();

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
  const [hideCompleted, setHideCompleted] = useState(true);

  const emptyForm = (): TaskForm => ({
    titulo: '', descripcion: '', prioridad: '', asignado_a: '',
    estado: 'en_progreso', fecha_compromiso: '', porcentaje_avance: 0,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TaskForm>(emptyForm());

  const [showEdit, setShowEdit] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [editForm, setEditForm] = useState<TaskForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const [inlineAvance, setInlineAvance] = useState<{ taskId: string; value: number } | null>(null);

  const fetchRefData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email?.toLowerCase() ?? '';

    const [empRes, coreUserRes] = await Promise.all([
      supabase.schema('erp' as any).from('empleados')
        .select('id, persona:persona_id(nombre, apellido_paterno)')
        .eq('empresa_id', EMPRESA_ID).eq('activo', true).is('deleted_at', null),
      supabase.schema('core' as any).from('usuarios')
        .select('id, rol').eq('email', email).maybeSingle(),
    ]);

    const mappedEmpleados = (empRes.data ?? []).map((e: any) => ({
      id: e.id,
      nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
    }));
    setEmpleados(mappedEmpleados);

    if (coreUserRes.data?.rol === 'admin') {
      setIsAdmin(true);
      setIsDireccion(true);
    }

    if (email) {
      const { data: persona } = await supabase
        .schema('erp' as any).from('personas').select('id')
        .eq('empresa_id', EMPRESA_ID).eq('email', email).maybeSingle();

      if (persona) {
        const { data: empleado } = await supabase
          .schema('erp' as any).from('empleados').select('id')
          .eq('empresa_id', EMPRESA_ID).eq('persona_id', persona.id)
          .eq('activo', true).maybeSingle();
        if (empleado) setCurrentEmpleadoId(empleado.id);
      }

      if (!coreUserRes.data || coreUserRes.data.rol !== 'admin') {
        const { data: ue } = await supabase
          .schema('core' as any).from('usuarios_empresas').select('rol_id')
          .eq('usuario_id', coreUserRes.data?.id ?? '').eq('empresa_id', EMPRESA_ID)
          .eq('activo', true).maybeSingle();

        if (ue?.rol_id) {
          const { data: role } = await supabase
            .schema('core' as any).from('roles').select('nombre')
            .eq('id', ue.rol_id).maybeSingle();
          if (role?.nombre?.toLowerCase() === 'direccion' || role?.nombre?.toLowerCase() === 'dirección') {
            setIsDireccion(true);
          }
        }
      }
    }
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('erp' as any).from('tasks').select('*')
      .eq('empresa_id', EMPRESA_ID).order('created_at', { ascending: false });
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

  const handleCreate = async () => {
    if (!createForm.titulo.trim() || !createForm.prioridad || !createForm.asignado_a || !createForm.fecha_compromiso) return;
    setCreating(true);
    const { error: err } = await supabase
      .schema('erp' as any).from('tasks').insert({
        empresa_id: EMPRESA_ID,
        titulo: createForm.titulo.trim(),
        descripcion: createForm.descripcion.trim() || null,
        prioridad: createForm.prioridad,
        asignado_a: createForm.asignado_a || null,
        asignado_por: currentEmpleadoId,
        estado: createForm.estado,
        fecha_compromiso: createForm.fecha_compromiso || null,
        porcentaje_avance: createForm.porcentaje_avance,
      });
    setCreating(false);
    if (err) { alert(`Error al crear tarea: ${err.message}`); return; }
    setShowCreate(false);
    setCreateForm(emptyForm());
    await fetchTasks();
  };

  const openEdit = (task: ErpTask) => {
    setSelectedTask(task);
    setEditForm({
      titulo: task.titulo,
      descripcion: task.descripcion ?? '',
      prioridad: task.prioridad ?? '',
      asignado_a: task.asignado_a ?? '',
      estado: task.estado,
      fecha_compromiso: task.fecha_compromiso ? task.fecha_compromiso.split('T')[0] : (task.fecha_vence ? task.fecha_vence.split('T')[0] : ''),
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
    if (task.asignado_por === currentEmpleadoId) return true;
    if (!task.asignado_por && task.asignado_a === currentEmpleadoId) return true;
    return false;
  }, [isAdmin, isDireccion, currentEmpleadoId]);

  const handleUpdate = async () => {
    if (!selectedTask || !editForm.titulo.trim()) return;
    setSaving(true);
    const updatePayload: Record<string, unknown> = {
      titulo: editForm.titulo.trim(),
      descripcion: editForm.descripcion.trim() || null,
      prioridad: editForm.prioridad || null,
      asignado_a: editForm.asignado_a || null,
      fecha_compromiso: editForm.fecha_compromiso || null,
      porcentaje_avance: editForm.porcentaje_avance,
    };
    if (canCompleteTask(selectedTask)) {
      updatePayload.estado = editForm.estado;
      if (editForm.estado === 'completado' && selectedTask.estado !== 'completado') {
        updatePayload.completado_por = currentEmpleadoId;
      }
    }
    const { error: err } = await supabase
      .schema('erp' as any).from('tasks').update(updatePayload).eq('id', selectedTask.id);
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
      .schema('erp' as any).from('tasks').delete().eq('id', selectedTask.id);
    setDeleting(false);
    if (err) { alert(`Error al eliminar: ${err.message}`); return; }
    setShowEdit(false);
    setSelectedTask(null);
    await fetchTasks();
  };

  const handleQuickComplete = async (taskId: string) => {
    setCompletingTaskId(taskId);
    const { error: err } = await supabase
      .schema('erp' as any).from('tasks')
      .update({ estado: 'completado', porcentaje_avance: 100, completado_por: currentEmpleadoId })
      .eq('id', taskId);
    setCompletingTaskId(null);
    if (err) { alert(`Error: ${err.message}`); return; }
    await fetchTasks();
  };

  const handleInlineEstadoSave = async (taskId: string, estado: ErpTask['estado']) => {
    const update: Record<string, unknown> = { estado };
    if (estado === 'completado') {
      update.completado_por = currentEmpleadoId;
      update.porcentaje_avance = 100;
    }
    await supabase.schema('erp' as any).from('tasks').update(update).eq('id', taskId);
    await fetchTasks();
  };

  const handleInlineAvanceSave = async (taskId: string, value: number) => {
    const update: Record<string, unknown> = { porcentaje_avance: value };
    if (value === 100) {
      update.estado = 'completado';
      update.completado_por = currentEmpleadoId;
    }
    await supabase.schema('erp' as any).from('tasks').update(update).eq('id', taskId);
    setInlineAvance(null);
    await fetchTasks();
  };

  const empleadoMap = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const empleadoOptions = useMemo(() => empleados.map(e => ({ id: e.id, label: e.nombre })), [empleados]);
  const deptoOptions = useMemo(() => {
    const deptos = new Set<string>();
    tasks.forEach(t => {
      if (t.departamento_nombre) {
        t.departamento_nombre.split(',').forEach(d => {
          const trimmed = d.trim();
          if (trimmed) deptos.add(trimmed);
        });
      }
    });
    return [...deptos].sort().map(d => ({ id: d, label: d }));
  }, [tasks]);
  const estadoOptions = useMemo(() => Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ id: k, label: v.label })), []);
  const prioridadOptions = useMemo(() => PRIORIDAD_OPTIONS.map(p => ({ id: p, label: p })), []);

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<ErpTask & { asignado_nombre: string | null }>('created_at', 'desc');

  const visibleTasks = useMemo(() => {
    if (isAdmin || isDireccion) return tasks;
    return tasks.filter((t) =>
      t.asignado_a === currentEmpleadoId ||
      t.asignado_por === currentEmpleadoId ||
      t.creado_por === currentEmpleadoId,
    );
  }, [tasks, isAdmin, isDireccion, currentEmpleadoId]);

  const filtered = visibleTasks.filter((t) => {
    if (hideCompleted && (t.estado === 'completado' || t.estado === 'cancelado')) return false;
    if (search) {
      const s = search.toLowerCase();
      const responsableName = empleadoMap.get(t.asignado_a ?? '')?.nombre?.toLowerCase() ?? '';
      if (!t.titulo.toLowerCase().includes(s) &&
          !t.descripcion?.toLowerCase().includes(s) &&
          !t.departamento_nombre?.toLowerCase().includes(s) &&
          !responsableName.includes(s)) return false;
    }
    if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'all' && t.prioridad?.toLowerCase() !== filterPrioridad.toLowerCase()) return false;
    if (filterAsignado !== 'all' && t.asignado_a !== filterAsignado) return false;
    if (filterDepto !== 'all') {
      const taskDeptos = (t.departamento_nombre ?? '').split(',').map(d => d.trim()).filter(Boolean);
      if (!taskDeptos.includes(filterDepto)) return false;
    }
    return true;
  });

  const canCreateTask = !!createForm.titulo.trim() && !!createForm.prioridad && !!createForm.asignado_a && !!createForm.fecha_compromiso;

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Tareas — DILESA</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Gestión de tareas operativas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => { setCreateForm(emptyForm()); setShowCreate(true); }} className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5">
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
              placeholder="Buscar por título, descripción o responsable..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
          <Combobox
            value={filterEstado}
            onChange={setFilterEstado}
            options={estadoOptions}
            placeholder="Estado"
            searchPlaceholder="Buscar estado..."
            allowClear
            clearLabel="Todos"
            className="w-40"
          />
          <Combobox
            value={filterPrioridad}
            onChange={setFilterPrioridad}
            options={prioridadOptions}
            placeholder="Prioridad"
            searchPlaceholder="Buscar prioridad..."
            allowClear
            clearLabel="Todas"
            className="w-36"
          />
          <Combobox
            value={filterAsignado}
            onChange={setFilterAsignado}
            options={empleadoOptions}
            placeholder="Asignado a"
            searchPlaceholder="Buscar responsable..."
            allowClear
            clearLabel="Todos"
            className="w-48"
          />
          <Combobox
            value={filterDepto}
            onChange={setFilterDepto}
            options={deptoOptions}
            placeholder="Depto"
            searchPlaceholder="Buscar departamento..."
            allowClear
            clearLabel="Todos"
            className="w-44"
          />
        </div>
      </div>

      {/* Toggle completadas */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setHideCompleted(h => !h)}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/60 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
        >
          {hideCompleted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {hideCompleted ? 'Mostrar completadas' : 'Ocultar completadas'}
        </button>
        {!loading && (
          <span className="text-xs text-[var(--text)]/40">
            {filtered.length} de {visibleTasks.length} tareas{hideCompleted ? ' (sin completadas)' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
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
                {(isDireccion || isAdmin) && <TableHead className="w-10 min-w-[40px]" />}
                <SortableHead sortKey="titulo" label="Tarea" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[140px] max-w-[220px]" />
                <SortableHead sortKey="prioridad" label="Prioridad" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[100px]" />
                <SortableHead sortKey="estado" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[90px]" />
                <SortableHead sortKey="porcentaje_avance" label="Avance" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[90px]" />
                <SortableHead sortKey="asignado_nombre" label="Responsable" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[120px]" />
                <SortableHead sortKey="fecha_compromiso" label="Compromiso" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[95px]" />
                <SortableHead sortKey="created_at" label="Días" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="min-w-[55px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(filtered.map((t) => ({
                ...t,
                asignado_nombre: empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
              }))).map((task) => {
                const empleado = empleadoMap.get(task.asignado_a ?? '');
                const isEditable = isDireccion || isAdmin;
                return (
                  <TableRow key={task.id} className="cursor-pointer border-[var(--border)] transition-colors hover:bg-[var(--panel)]" onClick={() => openEdit(task)}>
                    {(isDireccion || isAdmin) && (
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        {task.estado !== 'completado' && task.estado !== 'cancelado' ? (
                          <button
                            type="button"
                            title="Completar tarea"
                            disabled={completingTaskId === task.id}
                            onClick={() => handleQuickComplete(task.id)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
                          >
                            {completingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </button>
                        ) : (
                          <Check className="h-4 w-4 text-green-400/40" />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
                      <span className="mt-0.5 block text-xs text-[var(--text)]/40 line-clamp-1">
                        {[task.departamento_nombre, task.descripcion].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </TableCell>
                    <TableCell><PrioridadTextBadge text={task.prioridad} /></TableCell>

                    {/* Inline estado editing for admin */}
                    <TableCell onClick={(e) => isEditable ? e.stopPropagation() : undefined}>
                      {isEditable && task.estado !== 'completado' && task.estado !== 'cancelado' ? (
                        <Popover>
                          <PopoverTrigger className="cursor-pointer">
                            <EstadoBadge estado={task.estado} />
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-1" align="start">
                            <div className="flex flex-col gap-0.5">
                              {ESTADO_ORDER.map(est => (
                                <button
                                  key={est}
                                  type="button"
                                  onClick={() => handleInlineEstadoSave(task.id, est)}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors hover:bg-[var(--panel)] ${task.estado === est ? 'bg-[var(--panel)]' : ''}`}
                                >
                                  <EstadoBadge estado={est} />
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <EstadoBadge estado={task.estado} />
                      )}
                    </TableCell>

                    {/* Avance inline */}
                    <TableCell onClick={(e) => isEditable ? e.stopPropagation() : undefined}>
                      {isEditable ? (
                        <Popover
                          open={inlineAvance?.taskId === task.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setInlineAvance({ taskId: task.id, value: task.porcentaje_avance });
                            } else if (inlineAvance && inlineAvance.taskId === task.id) {
                              handleInlineAvanceSave(task.id, inlineAvance.value);
                            }
                          }}
                        >
                          <PopoverTrigger className="cursor-pointer">
                            <ProgressBar value={task.porcentaje_avance} />
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-3" align="start">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-[var(--text)]/60">
                                <span>Avance</span>
                                <span className="font-medium text-[var(--text)]">{inlineAvance?.taskId === task.id ? inlineAvance.value : task.porcentaje_avance}%</span>
                              </div>
                              <input type="range" min={0} max={100} step={5}
                                value={inlineAvance?.taskId === task.id ? inlineAvance.value : task.porcentaje_avance}
                                onChange={(e) => setInlineAvance(prev => prev ? { ...prev, value: Number(e.target.value) } : null)}
                                className="w-full accent-[var(--accent)]" />
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <ProgressBar value={task.porcentaje_avance ?? 0} />
                      )}
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-[var(--text)]/70 truncate block">{empleado ? empleado.nombre : '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-[var(--text)]/60">{formatDate(task.fecha_compromiso)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-[var(--text)]/60">
                        {(() => {
                          const days = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 86400000);
                          return days === 0 ? 'Hoy' : `${days}d`;
                        })()}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>



      {/* ── Create Sheet ──────────────────────────────────────────────── */}
      <Sheet open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreateForm(emptyForm()); } }}>
        <SheetContent side="right" className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-[var(--text)] text-lg">Nueva Tarea</SheetTitle>
            <SheetDescription className="text-[var(--text)]/50">
              Completa los campos requeridos para crear una tarea
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-4">
            <div>
              <FieldLabel required>Título</FieldLabel>
              <Input
                placeholder="Descripción breve de la tarea..."
                value={createForm.titulo}
                onChange={(e) => setCreateForm(f => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Descripción</FieldLabel>
              <Textarea
                placeholder="Detalla la tarea..."
                value={createForm.descripcion}
                onChange={(e) => setCreateForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Prioridad</FieldLabel>
                <Select value={createForm.prioridad} onValueChange={(v) => setCreateForm(f => ({ ...f, prioridad: v ?? '' }))}>
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDAD_OPTIONS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Estado se asigna automáticamente como 'en_progreso' */}
            </div>

            <div>
              <FieldLabel required>Responsable</FieldLabel>
              <Combobox
                value={createForm.asignado_a}
                onChange={(v) => setCreateForm(f => ({ ...f, asignado_a: v === 'all' ? '' : v }))}
                options={empleadoOptions}
                placeholder="Buscar responsable..."
                searchPlaceholder="Escriba un nombre..."
              />
            </div>

            <div>
              <FieldLabel required>Fecha Compromiso</FieldLabel>
              <Input
                type="date"
                value={createForm.fecha_compromiso}
                onChange={(e) => setCreateForm(f => ({ ...f, fecha_compromiso: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
            <Button
              variant="outline"
              onClick={() => { setShowCreate(false); setCreateForm(emptyForm()); }}
              className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !canCreateTask}
              className="flex-1 gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear tarea
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Edit Sheet ────────────────────────────────────────────────── */}
      <Sheet open={showEdit} onOpenChange={(open) => { if (!open) { setShowEdit(false); setSelectedTask(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-lg border-[var(--border)] bg-[var(--card)] text-[var(--text)] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-[var(--text)] text-lg">Editar Tarea</SheetTitle>
            <SheetDescription className="text-[var(--text)]/50">
              {selectedTask?.departamento_nombre && `${selectedTask.departamento_nombre} · `}
              Creada {formatDate(selectedTask?.created_at ?? null)}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-4">
            <div>
              <FieldLabel required>Título</FieldLabel>
              <Input
                placeholder="Descripción breve de la tarea..."
                value={editForm.titulo}
                onChange={(e) => setEditForm(f => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Descripción</FieldLabel>
              <Textarea
                placeholder="Detalla la tarea..."
                value={editForm.descripcion}
                onChange={(e) => setEditForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Select
                  value={editForm.estado}
                  onValueChange={(v) => setEditForm(f => ({ ...f, estado: v as ErpTask['estado'] }))}
                  disabled={!canCompleteTask(selectedTask)}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canCompleteTask(selectedTask) && (
                  <p className="mt-1 text-[10px] text-[var(--text)]/40">Solo dirección o el creador pueden cambiar el estado</p>
                )}
              </div>
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Select value={editForm.prioridad} onValueChange={(v) => setEditForm(f => ({ ...f, prioridad: v ?? '' }))}>
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDAD_OPTIONS.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel>Responsable</FieldLabel>
              <Combobox
                value={editForm.asignado_a}
                onChange={(v) => setEditForm(f => ({ ...f, asignado_a: v === 'all' ? '' : v }))}
                options={empleadoOptions}
                placeholder="Buscar responsable..."
                searchPlaceholder="Escriba un nombre..."
              />
            </div>

            <div>
              <FieldLabel>Fecha Compromiso</FieldLabel>
              <Input
                type="date"
                value={editForm.fecha_compromiso}
                onChange={(e) => setEditForm(f => ({ ...f, fecha_compromiso: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Avance ({editForm.porcentaje_avance}%)</FieldLabel>
              <input
                type="range" min={0} max={100} step={5}
                value={editForm.porcentaje_avance}
                onChange={(e) => setEditForm(f => ({ ...f, porcentaje_avance: Number(e.target.value) }))}
                className="w-full accent-[var(--accent)]"
              />
            </div>

            {/* Metadata (read-only) */}
            {(selectedTask?.iniciativa || selectedTask?.tipo || selectedTask?.fecha_vence || selectedTask?.motivo_bloqueo || selectedTask?.siguiente_accion) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-[var(--panel)] p-3 border border-[var(--border)] text-[11px]">
                {selectedTask.iniciativa && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Iniciativa</span> {selectedTask.iniciativa}</div>
                )}
                {selectedTask.tipo && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Tipo</span> {selectedTask.tipo}</div>
                )}
                {selectedTask.fecha_vence && (
                  <div><span className="font-semibold text-[var(--text)]/40 block">Fecha Vence</span> {formatDate(selectedTask.fecha_vence)}</div>
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

          <div className="flex items-center gap-2 pt-4 border-t border-[var(--border)]">
            {canModifyTask(selectedTask) && (
              <Button
                variant="outline" size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => { setShowEdit(false); setSelectedTask(null); }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving || !editForm.titulo.trim()}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
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
      <TasksInner />
    </RequireAccess>
  );
}
