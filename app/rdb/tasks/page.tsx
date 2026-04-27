'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing debt. `any` in Supabase row mapping;
 * set-state-in-effect in data-sync pattern. Both are behavioral rewrites,
 * out of scope for bulk lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  RefreshCw,
  Loader2,
  TicketCheck,
  MessageSquarePlus,
  Clock,
} from 'lucide-react';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type ErpTask = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  asignado_a: string | null;
  creado_por: string | null;
  prioridad: string | null;
  estado: 'pendiente' | 'en_progreso' | 'bloqueado' | 'completado' | 'cancelado';
  fecha_vence: string | null;
  porcentaje_avance: number | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type Empleado = { id: string; nombre: string };

type TaskUpdate = {
  id: string;
  task_id: string;
  tipo: string;
  contenido: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  creado_por: string | null;
  created_at: string;
  usuario?: { nombre: string } | null;
};

type CreateForm = {
  titulo: string;
  descripcion: string;
  prioridad: string;
  asignado_a: string;
  estado: ErpTask['estado'];
  fecha_vence: string;
};

import { ESTADO_CONFIG } from '@/components/tasks/tasks-shared';

const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string }> = {
  Urgente: { label: 'Urgente', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  Alta: { label: 'Alta', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  Media: { label: 'Media', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  Baja: { label: 'Baja', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
};

const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EstadoBadge({ estado }: { estado: ErpTask['estado'] }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, cls: '' };
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function PrioridadBadge({ prioridad }: { prioridad: string | null }) {
  if (!prioridad) return <span className="text-[var(--text-subtle)]">—</span>;
  const cfg = PRIORIDAD_CONFIG[prioridad] ?? { label: prioridad, cls: '' };
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function TasksInner() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [tasks, setTasks] = useState<ErpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterPrioridad, setFilterPrioridad] = useState('all');
  const [filterAsignado, setFilterAsignado] = useState('all');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    titulo: '',
    descripcion: '',
    prioridad: '',
    asignado_a: '',
    estado: 'pendiente',
    fecha_vence: '',
  });

  const [taskUpdates, setTaskUpdates] = useState<TaskUpdate[]>([]);
  const [showUpdatesSheet, setShowUpdatesSheet] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState({ contenido: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [loadingUpdates, setLoadingUpdates] = useState(false);

  const fetchRefData = useCallback(async () => {
    const { data: empRes } = await supabase
      .schema('erp')
      .from('empleados')
      .select('id, persona:persona_id(nombre, apellido_paterno)')
      .eq('empresa_id', EMPRESA_ID)
      .eq('activo', true)
      .is('deleted_at', null);
    setEmpleados(
      (empRes ?? []).map((e: any) => ({
        id: e.id,
        nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
      }))
    );
  }, [supabase]);

  const fetchTasks = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setTasks((data ?? []) as ErpTask[]);
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
    return () => {
      cancelled = true;
    };
  }, [fetchRefData, fetchTasks]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchTasks();
    setLoading(false);
  };

  const resetForm = () =>
    setCreateForm({
      titulo: '',
      descripcion: '',
      prioridad: '',
      asignado_a: '',
      estado: 'pendiente',
      fecha_vence: '',
    });

  const handleCreate = async () => {
    if (!createForm.titulo.trim()) return;
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

    const { data: newTask, error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .insert({
        empresa_id: EMPRESA_ID,
        titulo: createForm.titulo.trim(),
        descripcion: createForm.descripcion.trim() || null,
        prioridad: createForm.prioridad || null,
        asignado_a: createForm.asignado_a || null,
        estado: createForm.estado,
        fecha_vence: createForm.fecha_vence || null,
        creado_por: coreUser?.id ?? null,
      })
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

  const fetchUpdatesForTask = async (taskId: string) => {
    setLoadingUpdates(true);
    const { data: updatesData } = await supabase
      .schema('erp')
      .from('task_updates')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (updatesData && updatesData.length > 0) {
      const userIds = [...new Set(updatesData.map((u: any) => u.creado_por).filter(Boolean))];
      const { data: usersData } =
        userIds.length > 0
          ? await supabase
              .schema('core')
              .from('usuarios')
              .select('id, first_name')
              .in('id', userIds)
          : { data: [] };
      const userMap = new Map((usersData ?? []).map((u: any) => [u.id, u.first_name]));
      setTaskUpdates(
        updatesData.map((u: any) => ({
          ...u,
          usuario: u.creado_por ? { nombre: userMap.get(u.creado_por) ?? 'Usuario' } : null,
        }))
      );
    } else {
      setTaskUpdates([]);
    }
    setLoadingUpdates(false);
  };

  const handleOpenUpdatesSheet = (taskId: string) => {
    setShowUpdatesSheet(taskId);
    setUpdateForm({ contenido: '' });
    void fetchUpdatesForTask(taskId);
  };

  const handleSaveUpdate = async () => {
    const taskId = showUpdatesSheet;
    if (!taskId || !updateForm.contenido.trim()) return;
    setSavingUpdate(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id, first_name')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();
    const userId = coreUser?.id ?? null;
    const userName = coreUser?.first_name ?? 'Usuario';

    const { error: insErr } = await supabase.schema('erp').from('task_updates').insert({
      task_id: taskId,
      empresa_id: EMPRESA_ID,
      tipo: 'avance',
      contenido: updateForm.contenido.trim(),
      creado_por: userId,
    });
    if (insErr) {
      alert(`Error: ${insErr.message}`);
      setSavingUpdate(false);
      return;
    }

    const now = new Date().toISOString();
    setTaskUpdates((prev) => [
      {
        id: `temp-${Date.now()}`,
        task_id: taskId,
        tipo: 'avance',
        contenido: updateForm.contenido.trim(),
        valor_anterior: null,
        valor_nuevo: null,
        creado_por: userId,
        created_at: now,
        usuario: { nombre: userName },
      },
      ...prev,
    ]);

    setSavingUpdate(false);
    setUpdateForm({ contenido: '' });
  };

  const empleadoMap = new Map(empleados.map((e) => [e.id, e]));

  const filtered = tasks.filter((t) => {
    if (search && !t.titulo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'all' && t.prioridad !== filterPrioridad) return false;
    if (filterAsignado !== 'all' && t.asignado_a !== filterAsignado) return false;
    return true;
  });

  const tasksColumns: Column<ErpTask>[] = [
    {
      key: 'titulo',
      label: 'Título',
      render: (task) => (
        <>
          <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
          {task.entidad_tipo && (
            <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
              {task.entidad_tipo}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      width: 'w-28',
      render: (task) => <EstadoBadge estado={task.estado} />,
    },
    {
      key: 'prioridad',
      label: 'Prioridad',
      width: 'w-28',
      accessor: (t) => {
        const idx = (PRIORIDAD_OPTIONS as readonly string[]).indexOf(t.prioridad ?? '');
        return idx === -1 ? null : idx;
      },
      render: (task) => <PrioridadBadge prioridad={task.prioridad} />,
    },
    {
      key: 'asignado_a',
      label: 'Asignado a',
      width: 'w-40',
      accessor: (t) => empleadoMap.get(t.asignado_a ?? '')?.nombre ?? null,
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (task) => empleadoMap.get(task.asignado_a ?? '')?.nombre ?? '—',
    },
    {
      key: 'fecha_vence',
      label: 'Vence',
      width: 'w-28',
      cellClassName: 'text-sm text-[var(--text)]/70',
      render: (task) => formatDate(task.fecha_vence),
    },
    {
      key: 'updates',
      label: '',
      sortable: false,
      width: 'w-10',
      render: (task) => (
        <DataTable.InteractiveCell>
          <button
            type="button"
            title="Ver / agregar avances"
            onClick={() => handleOpenUpdatesSheet(task.id)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
          >
            <MessageSquarePlus className="h-3 w-3" />
          </button>
        </DataTable.InteractiveCell>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Tareas</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Gestión de tareas operativas</p>
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <Input
              placeholder="Buscar tareas..."
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
            value={filterPrioridad}
            onChange={setFilterPrioridad}
            options={PRIORIDAD_OPTIONS.map((p) => ({ id: p, label: p }))}
            placeholder="Prioridad"
            searchPlaceholder="Buscar prioridad..."
            clearLabel="Todas"
            className="w-36"
          />
          <FilterCombobox
            value={filterAsignado}
            onChange={setFilterAsignado}
            options={empleados.map((e) => ({ id: e.id, label: e.nombre }))}
            placeholder="Asignado a"
            searchPlaceholder="Buscar responsable..."
            clearLabel="Todos"
            className="w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <DataTable<ErpTask>
          data={filtered}
          columns={tasksColumns}
          rowKey="id"
          loading={loading}
          error={error}
          onRowClick={(task) => router.push(`/rdb/tasks/${task.id}`)}
          initialSort={{ key: 'created_at', dir: 'desc' }}
          showDensityToggle={false}
          emptyIcon={<TicketCheck className="h-10 w-10 text-[var(--text)]/20" />}
          emptyTitle={
            tasks.length === 0
              ? 'No hay tareas creadas aún'
              : 'No hay tareas que coincidan con los filtros'
          }
          emptyAction={
            tasks.length === 0 ? (
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-4 w-4" />
                Crear primera tarea
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Summary */}
      {!loading && tasks.length > 0 && (
        <p className="text-right text-xs text-[var(--text-subtle)]">
          {filtered.length} de {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
        </p>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nueva Tarea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Título *</FieldLabel>
              <Input
                placeholder="Descripción breve de la tarea..."
                value={createForm.titulo}
                onChange={(e) => setCreateForm((f) => ({ ...f, titulo: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div>
              <FieldLabel>Descripción</FieldLabel>
              <Textarea
                placeholder="Detalla la tarea..."
                value={createForm.descripcion}
                onChange={(e) => setCreateForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={3}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Estado</FieldLabel>
                <Combobox
                  value={createForm.estado}
                  onChange={(v) => setCreateForm((f) => ({ ...f, estado: v as ErpTask['estado'] }))}
                  options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Combobox
                  value={createForm.prioridad}
                  onChange={(v) => setCreateForm((f) => ({ ...f, prioridad: v }))}
                  options={PRIORIDAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                  placeholder="Sin prioridad"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Asignado a</FieldLabel>
                <Combobox
                  value={createForm.asignado_a}
                  onChange={(v) => setCreateForm((f) => ({ ...f, asignado_a: v }))}
                  options={empleados.map((e) => ({ value: e.id, label: e.nombre }))}
                  placeholder="Sin asignar"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Fecha límite</FieldLabel>
                <Input
                  type="date"
                  value={createForm.fecha_vence}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_vence: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>
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
