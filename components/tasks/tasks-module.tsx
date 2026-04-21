'use client';

/**
 * TasksModule — reusable Tasks (admin) module.
 *
 * Consolidates the previously duplicated pages under
 *  - app/rdb/admin/tasks
 *  - app/dilesa/admin/tasks
 *  - app/inicio/tasks
 * into a single parametrized component.
 *
 * Two variants:
 *
 *   <TasksModule empresaId="<uuid>" empresaSlug="rdb" title="Tareas — Rincón del Bosque" />
 *     → simple variant (rdb). Dialog-based create/edit, 5-col table, no updates.
 *
 *   <TasksModule empresaId="<uuid>" empresaSlug="dilesa" title="Tareas — DILESA" variant="rich" />
 *     → DILESA variant. Sheet UI, role-gated quick-complete, inline estado/avance,
 *       task_updates feature, junta auto-linking, soft-filter on visibility.
 *
 *   <TasksModule scope="user-empresas" empresaSlug="" title="Tareas" />
 *     → inicio (global). Simple variant, resolves empresaIds from usuarios_empresas.
 *
 * Tasks are polymorphic (`entidad_tipo`/`entidad_id`) and commonly link to juntas.
 * This module preserves that linkage:
 *  - Simple variant displays `entidad_tipo` under the title.
 *  - Rich variant auto-links new tasks to an in-progress `erp.juntas` row when
 *    one exists for the empresa (original DILESA behavior).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Eye, EyeOff } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import type { TablesInsert, TablesUpdate } from '@/types/supabase';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useSortableTable } from '@/hooks/use-sortable-table';

import { emptyTaskForm } from './tasks-shared';
import type { Empleado, ErpTask, TaskEstado, TaskFormValues, TaskUpdateRow } from './tasks-shared';
import { TasksTable } from './tasks-table';
import { TasksCreateForm } from './tasks-create-form';
import { TasksEditForm } from './tasks-edit-form';
import { TasksUpdatesSheet } from './tasks-updates-sheet';
import { TasksFiltersBar } from './tasks-filters-bar';

type TasksInsert = TablesInsert<{ schema: 'erp' }, 'tasks'>;
type TasksUpdatePayload = TablesUpdate<{ schema: 'erp' }, 'tasks'>;

export type TasksModuleProps = {
  /** Single-empresa mode: filter all queries by this empresa_id. */
  empresaId?: string;

  /**
   * Scope mode:
   *  - omitted or 'empresa' → use `empresaId` (single).
   *  - 'user-empresas' → fetch the current user's empresa ids from
   *    core.usuarios_empresas (inicio / global admin view).
   */
  scope?: 'empresa' | 'user-empresas';

  /** URL slug — reserved for future detail-page linking. */
  empresaSlug: string;

  /** Page heading (e.g. "Tareas — DILESA"). */
  title: string;

  /** Optional subtitle. Defaults to "Gestión de tareas operativas". */
  subtitle?: string;

  /**
   * UI/feature variant:
   *  - 'simple' (default) — rdb/inicio style.
   *  - 'rich' — DILESA style with updates, inline editing, role gating.
   */
  variant?: 'simple' | 'rich';

  /** Rich-only: auto-link new tasks to an in-progress junta (default true). */
  autoLinkJunta?: boolean;

  /**
   * Personal view: filter to tasks where `asignado_a` matches the current
   * user's empleado_id across all their empresas. Used by `/inicio/tasks`.
   */
  onlyMine?: boolean;

  /**
   * Show the "Ocultar/Mostrar completadas" toggle (always shown on rich).
   * When true in simple variant, also applies the `hideCompleted` filter.
   */
  hideCompletedToggle?: boolean;
};

export function TasksModule({
  empresaId,
  scope = 'empresa',
  empresaSlug: _empresaSlug,
  title,
  subtitle = 'Gestión de tareas operativas',
  variant = 'simple',
  autoLinkJunta = true,
  onlyMine = false,
  hideCompletedToggle = false,
}: TasksModuleProps) {
  // `_empresaSlug` is accepted for call-site parity with EmpleadosModule and
  // future detail-page links; silence unused-var lint until then.
  void _empresaSlug;

  const supabase = createSupabaseERPClient();
  const isRich = variant === 'rich';

  // ── Empresa scope ──────────────────────────────────────────────────────────
  const [empresaIds, setEmpresaIds] = useState<string[]>(
    scope === 'empresa' && empresaId ? [empresaId] : []
  );

  // ── Identity / role state (rich only) ──────────────────────────────────────
  const [currentEmpleadoId, setCurrentEmpleadoId] = useState<string | null>(null);
  const [isDireccion, setIsDireccion] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Personal view (onlyMine) ───────────────────────────────────────────────
  // null = still loading, [] = user has no empleado rows, [...] = resolved.
  const [myEmpleadoIds, setMyEmpleadoIds] = useState<string[] | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [tasks, setTasks] = useState<ErpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterPrioridad, setFilterPrioridad] = useState('all');
  const [filterAsignado, setFilterAsignado] = useState('all');
  const [filterDepto, setFilterDepto] = useState('all'); // rich only
  // Used by rich variant and by simple+hideCompletedToggle.
  const [hideCompleted, setHideCompleted] = useState(true);

  // ── Create / edit state ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TaskFormValues>(emptyTaskForm());

  const [showEdit, setShowEdit] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ErpTask | null>(null);
  const [editForm, setEditForm] = useState<TaskFormValues>(emptyTaskForm());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Rich-only: inline editing + updates ───────────────────────────────────
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [inlineAvance, setInlineAvance] = useState<{ taskId: string; value: number } | null>(null);
  const [taskUpdates, setTaskUpdates] = useState<TaskUpdateRow[]>([]);
  const [showUpdatesSheet, setShowUpdatesSheet] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState('');
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [loadingUpdates, setLoadingUpdates] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Ref data (empleados + identity)
  // ───────────────────────────────────────────────────────────────────────────

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    if (scope === 'empresa') return empresaId ? [empresaId] : [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();
    if (!coreUser) return [];
    const { data: ueData } = await supabase
      .schema('core')
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', coreUser.id)
      .eq('activo', true);
    const ids = (ueData ?? []).map((r: { empresa_id: string }) => r.empresa_id);
    setEmpresaIds(ids);
    return ids;
  }, [scope, empresaId, supabase]);

  const fetchRefData = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setEmpleados([]);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email?.toLowerCase() ?? '';

      // empleados list (shared by all variants)
      const { data: empData } = await supabase
        .schema('erp')
        .from('empleados')
        .select('id, persona:persona_id(nombre, apellido_paterno)')
        .in('empresa_id', ids)
        .eq('activo', true)
        .is('deleted_at', null);

      const mapped: Empleado[] = (empData ?? []).map((e: Record<string, unknown>) => {
        const persona = Array.isArray(e.persona) ? e.persona[0] : e.persona;
        const p = (persona ?? null) as { nombre?: string; apellido_paterno?: string } | null;
        return {
          id: e.id as string,
          nombre: [p?.nombre, p?.apellido_paterno].filter(Boolean).join(' '),
        };
      });
      setEmpleados(mapped);

      // Personal view: resolve my empleado_ids across all empresas in scope.
      if (onlyMine) {
        if (!email) {
          setMyEmpleadoIds([]);
        } else {
          const { data: mineRows } = await supabase
            .schema('erp')
            .from('v_empleados_full')
            .select('empleado_id, empresa_id, email_empresa, email_personal')
            .in('empresa_id', ids)
            .or(`email_empresa.eq.${email},email_personal.eq.${email}`);
          const mineIds = (mineRows ?? [])
            .map((r: { empleado_id: string | null }) => r.empleado_id)
            .filter((x: string | null): x is string => Boolean(x));
          setMyEmpleadoIds(mineIds);
        }
      }

      if (!isRich || !email) return;

      // Role gating + currentEmpleadoId (DILESA / rich variant only)
      const { data: coreUser } = await supabase
        .schema('core')
        .from('usuarios')
        .select('id, rol')
        .eq('email', email)
        .maybeSingle();

      if (coreUser?.rol === 'admin') {
        setIsAdmin(true);
        setIsDireccion(true);
      }

      // currentEmpleadoId — resolve via persona.email
      const primaryEmpresa = ids[0];
      if (primaryEmpresa) {
        const { data: persona } = await supabase
          .schema('erp')
          .from('personas')
          .select('id')
          .eq('empresa_id', primaryEmpresa)
          .eq('email', email)
          .maybeSingle();

        if (persona) {
          const { data: empleado } = await supabase
            .schema('erp')
            .from('empleados')
            .select('id')
            .eq('empresa_id', primaryEmpresa)
            .eq('persona_id', persona.id)
            .eq('activo', true)
            .maybeSingle();
          if (empleado) setCurrentEmpleadoId(empleado.id as string);
        }

        if (!coreUser || coreUser.rol !== 'admin') {
          const { data: ue } = await supabase
            .schema('core')
            .from('usuarios_empresas')
            .select('rol_id')
            .eq('usuario_id', coreUser?.id ?? '')
            .eq('empresa_id', primaryEmpresa)
            .eq('activo', true)
            .maybeSingle();
          if (ue?.rol_id) {
            const { data: role } = await supabase
              .schema('core')
              .from('roles')
              .select('nombre')
              .eq('id', ue.rol_id)
              .maybeSingle();
            const rname = role?.nombre?.toLowerCase();
            if (rname === 'direccion' || rname === 'dirección') setIsDireccion(true);
          }
        }
      }
    },
    [supabase, isRich, onlyMine]
  );

  const fetchTasks = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setTasks([]);
        return;
      }
      const { data, error: err } = await supabase
        .schema('erp')
        .from('tasks')
        .select('*')
        .in('empresa_id', ids)
        .order('created_at', { ascending: false });
      if (err) {
        setError(err.message);
        return;
      }
      setTasks((data ?? []) as unknown as ErpTask[]);
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchRefData(ids);
      if (cancelled) return;
      await fetchTasks(ids);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchEmpresaIds, fetchRefData, fetchTasks]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchTasks(empresaIds);
    setLoading(false);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Permissions (rich only)
  // ───────────────────────────────────────────────────────────────────────────

  const canModifyTask = useCallback(
    (task: ErpTask | null) => {
      if (!task) return false;
      if (isAdmin || isDireccion) return true;
      if (task.asignado_por === currentEmpleadoId) return true;
      return false;
    },
    [isAdmin, isDireccion, currentEmpleadoId]
  );

  const canCompleteTask = useCallback(
    (task: ErpTask | null) => {
      if (!task) return false;
      if (isAdmin || isDireccion) return true;
      if (task.asignado_por === currentEmpleadoId) return true;
      if (!task.asignado_por && task.asignado_a === currentEmpleadoId) return true;
      return false;
    },
    [isAdmin, isDireccion, currentEmpleadoId]
  );

  const canEditInline = isAdmin || isDireccion;

  // ───────────────────────────────────────────────────────────────────────────
  // Mutations
  // ───────────────────────────────────────────────────────────────────────────

  const resolveInsertEmpresaId = () => empresaId ?? empresaIds[0] ?? null;

  const handleCreate = async () => {
    const insertEmpresaId = resolveInsertEmpresaId();
    if (!insertEmpresaId) return;

    if (isRich) {
      if (
        !createForm.titulo.trim() ||
        !createForm.prioridad ||
        !createForm.asignado_a ||
        !createForm.fecha_compromiso
      ) {
        return;
      }
    } else {
      if (!createForm.titulo.trim()) return;
    }
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

    let payload: TasksInsert;
    if (isRich) {
      // Optional junta auto-link
      let entidad: { entidad_tipo?: string; entidad_id?: string } = {};
      if (autoLinkJunta) {
        const { data: activeJunta } = await supabase
          .schema('erp')
          .from('juntas')
          .select('id')
          .eq('empresa_id', insertEmpresaId)
          .eq('estado', 'en_curso')
          .order('fecha_hora', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeJunta) entidad = { entidad_tipo: 'junta', entidad_id: activeJunta.id as string };
      }
      payload = {
        empresa_id: insertEmpresaId,
        titulo: createForm.titulo.trim(),
        descripcion: createForm.descripcion.trim() || null,
        prioridad: createForm.prioridad,
        asignado_a: createForm.asignado_a || null,
        asignado_por: currentEmpleadoId,
        estado: createForm.estado,
        fecha_compromiso: createForm.fecha_compromiso || null,
        porcentaje_avance: createForm.porcentaje_avance,
        motivo_bloqueo:
          createForm.estado === 'bloqueado' ? createForm.motivo_bloqueo.trim() || null : null,
        ...entidad,
      } as TasksInsert;
    } else {
      payload = {
        empresa_id: insertEmpresaId,
        titulo: createForm.titulo.trim(),
        descripcion: createForm.descripcion.trim() || null,
        prioridad: createForm.prioridad || null,
        asignado_a: createForm.asignado_a || null,
        estado: createForm.estado,
        fecha_vence: createForm.fecha_vence || null,
        creado_por: coreUser?.id ?? null,
      } as TasksInsert;
    }

    const { error: err } = await supabase.schema('erp').from('tasks').insert(payload);
    setCreating(false);
    if (err) {
      alert(`Error al crear tarea: ${err.message}`);
      return;
    }
    setShowCreate(false);
    setCreateForm(emptyTaskForm());
    await fetchTasks(empresaIds);
  };

  const openEdit = (task: ErpTask) => {
    setSelectedTask(task);
    setEditForm({
      titulo: task.titulo,
      descripcion: task.descripcion ?? '',
      prioridad: task.prioridad ?? '',
      asignado_a: task.asignado_a ?? '',
      estado: task.estado,
      fecha_vence: task.fecha_vence ? task.fecha_vence.split('T')[0] : '',
      fecha_compromiso: task.fecha_compromiso
        ? task.fecha_compromiso.split('T')[0]
        : task.fecha_vence
          ? task.fecha_vence.split('T')[0]
          : '',
      porcentaje_avance: task.porcentaje_avance ?? 0,
      motivo_bloqueo: task.motivo_bloqueo ?? '',
    });
    setUpdateContent('');
    setShowEdit(true);
    if (isRich) void fetchUpdatesForTask(task.id);
  };

  const handleUpdate = async () => {
    if (!selectedTask || !editForm.titulo.trim()) return;
    setSaving(true);
    let payload: TasksUpdatePayload;
    if (isRich) {
      payload = {
        titulo: editForm.titulo.trim(),
        descripcion: editForm.descripcion.trim() || null,
        prioridad: editForm.prioridad || null,
        asignado_a: editForm.asignado_a || null,
        fecha_compromiso: editForm.fecha_compromiso || null,
        porcentaje_avance: editForm.porcentaje_avance,
      };
      if (canCompleteTask(selectedTask)) {
        payload.estado = editForm.estado;
        if (editForm.estado === 'completado' && selectedTask.estado !== 'completado') {
          payload.completado_por = currentEmpleadoId;
        }
        payload.motivo_bloqueo =
          editForm.estado === 'bloqueado' ? editForm.motivo_bloqueo.trim() || null : null;
      }
    } else {
      payload = {
        titulo: editForm.titulo.trim(),
        descripcion: editForm.descripcion.trim() || null,
        prioridad: editForm.prioridad || null,
        asignado_a: editForm.asignado_a || null,
        estado: editForm.estado,
        fecha_vence: editForm.fecha_vence || null,
      };
    }
    const { error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .update(payload)
      .eq('id', selectedTask.id);
    setSaving(false);
    if (err) {
      alert(`Error al guardar tarea: ${err.message}`);
      return;
    }
    setShowEdit(false);
    setSelectedTask(null);
    await fetchTasks(empresaIds);
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (!selectedTask || !canModifyTask(selectedTask)) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTask) return;
    setDeleting(true);
    const { error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .delete()
      .eq('id', selectedTask.id);
    setDeleting(false);
    if (err) {
      alert(`Error al eliminar: ${err.message}`);
      return;
    }
    setShowEdit(false);
    setSelectedTask(null);
    await fetchTasks(empresaIds);
  };

  const handleQuickComplete = async (taskId: string) => {
    setCompletingTaskId(taskId);
    const { error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .update({
        estado: 'completado',
        porcentaje_avance: 100,
        completado_por: currentEmpleadoId,
      } as TasksUpdatePayload)
      .eq('id', taskId);
    setCompletingTaskId(null);
    if (err) {
      alert(`Error: ${err.message}`);
      return;
    }
    await fetchTasks(empresaIds);
  };

  const handleInlineEstadoSave = async (taskId: string, estado: TaskEstado) => {
    const payload: TasksUpdatePayload = { estado };
    if (estado === 'completado') {
      payload.completado_por = currentEmpleadoId;
      payload.porcentaje_avance = 100;
    }
    if (estado === 'bloqueado') {
      const motivo = prompt('Motivo del bloqueo:');
      if (motivo === null) return;
      payload.motivo_bloqueo = motivo.trim() || null;
    } else {
      payload.motivo_bloqueo = null;
    }
    await supabase.schema('erp').from('tasks').update(payload).eq('id', taskId);
    await fetchTasks(empresaIds);
  };

  const handleInlineAvanceSave = async (taskId: string, value: number) => {
    const payload: TasksUpdatePayload = { porcentaje_avance: value };
    if (value === 100) {
      payload.estado = 'completado';
      payload.completado_por = currentEmpleadoId;
    }
    await supabase.schema('erp').from('tasks').update(payload).eq('id', taskId);
    setInlineAvance(null);
    await fetchTasks(empresaIds);
  };

  // ── Updates (rich only) ───────────────────────────────────────────────────
  const fetchUpdatesForTask = async (taskId: string) => {
    setLoadingUpdates(true);
    const { data: updatesData } = await supabase
      .schema('erp')
      .from('task_updates')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (updatesData && updatesData.length > 0) {
      const userIds = [
        ...new Set(
          (updatesData as Array<{ creado_por: string | null }>)
            .map((u) => u.creado_por)
            .filter(Boolean)
        ),
      ] as string[];
      const usersRes =
        userIds.length > 0
          ? await supabase
              .schema('core')
              .from('usuarios')
              .select('id, first_name')
              .in('id', userIds)
          : { data: [] as Array<{ id: string; first_name: string | null }> };
      const userMap = new Map(
        (usersRes.data ?? []).map((u: { id: string; first_name: string | null }) => [
          u.id,
          u.first_name,
        ])
      );
      setTaskUpdates(
        (updatesData as Array<Record<string, unknown>>).map((u) => ({
          ...(u as unknown as TaskUpdateRow),
          usuario: u.creado_por
            ? { nombre: userMap.get(u.creado_por as string) ?? 'Usuario' }
            : null,
        }))
      );
    } else {
      setTaskUpdates([]);
    }
    setLoadingUpdates(false);
  };

  const handleOpenUpdates = (taskId: string) => {
    setShowUpdatesSheet(taskId);
    setUpdateContent('');
    void fetchUpdatesForTask(taskId);
  };

  const handleSaveUpdate = async (taskId: string | null) => {
    const id = taskId ?? showUpdatesSheet ?? selectedTask?.id ?? null;
    if (!id || !updateContent.trim()) return;
    const insertEmpresaId = resolveInsertEmpresaId();
    if (!insertEmpresaId) return;

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
      task_id: id,
      empresa_id: insertEmpresaId,
      tipo: 'avance',
      contenido: updateContent.trim(),
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
        task_id: id,
        tipo: 'avance',
        contenido: updateContent.trim(),
        valor_anterior: null,
        valor_nuevo: null,
        creado_por: userId,
        created_at: now,
        usuario: { nombre: userName },
      },
      ...prev,
    ]);
    setSavingUpdate(false);
    setUpdateContent('');
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Derived state
  // ───────────────────────────────────────────────────────────────────────────

  const empleadoMap = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const empleadoOptions = useMemo(
    () => empleados.map((e) => ({ id: e.id, label: e.nombre })),
    [empleados]
  );

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('created_at', 'desc');

  const visibleTasks = useMemo(() => {
    if (onlyMine) {
      // While resolving ids, hide everything (avoid flashing all tasks).
      if (myEmpleadoIds === null) return [];
      if (myEmpleadoIds.length === 0) return [];
      const idSet = new Set(myEmpleadoIds);
      return tasks.filter((t) => t.asignado_a && idSet.has(t.asignado_a));
    }
    if (!isRich) return tasks;
    if (isAdmin || isDireccion) return tasks;
    return tasks.filter(
      (t) =>
        t.asignado_a === currentEmpleadoId ||
        t.asignado_por === currentEmpleadoId ||
        t.creado_por === currentEmpleadoId
    );
  }, [tasks, isRich, isAdmin, isDireccion, currentEmpleadoId, onlyMine, myEmpleadoIds]);

  const showHideCompletedToggle = isRich || hideCompletedToggle;

  const filtered = visibleTasks.filter((t) => {
    if (
      showHideCompletedToggle &&
      hideCompleted &&
      (t.estado === 'completado' || t.estado === 'cancelado')
    )
      return false;

    if (search) {
      const s = search.toLowerCase();
      if (isRich) {
        const responsableName = empleadoMap.get(t.asignado_a ?? '')?.nombre?.toLowerCase() ?? '';
        if (
          !t.titulo.toLowerCase().includes(s) &&
          !t.descripcion?.toLowerCase().includes(s) &&
          !t.departamento_nombre?.toLowerCase().includes(s) &&
          !responsableName.includes(s)
        )
          return false;
      } else if (!t.titulo.toLowerCase().includes(s)) {
        return false;
      }
    }
    if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'all') {
      if (isRich) {
        if (t.prioridad?.toLowerCase() !== filterPrioridad.toLowerCase()) return false;
      } else if (t.prioridad !== filterPrioridad) return false;
    }
    if (filterAsignado !== 'all' && t.asignado_a !== filterAsignado) return false;
    if (isRich && filterDepto !== 'all') {
      const taskDeptos = (t.departamento_nombre ?? '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      if (!taskDeptos.includes(filterDepto)) return false;
    }
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const updatesSheetTask = useMemo(
    () => (showUpdatesSheet ? (tasks.find((t) => t.id === showUpdatesSheet) ?? null) : null),
    [showUpdatesSheet, tasks]
  );

  return (
    <div className={`space-y-6 ${isRich ? 'min-w-0' : ''}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">{subtitle}</p>
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
            onClick={() => {
              setCreateForm(emptyTaskForm());
              setShowCreate(true);
            }}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nueva Tarea
          </Button>
        </div>
      </div>

      {/* Filters */}
      <TasksFiltersBar
        variant={isRich ? 'rich' : 'simple'}
        tasks={tasks}
        search={search}
        onSearchChange={setSearch}
        filterEstado={filterEstado}
        onFilterEstadoChange={setFilterEstado}
        filterPrioridad={filterPrioridad}
        onFilterPrioridadChange={setFilterPrioridad}
        filterAsignado={filterAsignado}
        onFilterAsignadoChange={setFilterAsignado}
        filterDepto={filterDepto}
        onFilterDeptoChange={setFilterDepto}
        empleados={empleados}
        empleadoOptions={empleadoOptions}
      />

      {/* Hide-completadas toggle (rich or when explicitly enabled) */}
      {showHideCompletedToggle && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setHideCompleted((h) => !h)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/60 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
          >
            {hideCompleted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hideCompleted ? 'Mostrar completadas' : 'Ocultar completadas'}
          </button>
          {!loading && (
            <span className="text-xs text-[var(--text)]/40">
              {filtered.length} de {visibleTasks.length} tareas
              {hideCompleted ? ' (sin completadas)' : ''}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div
        className={`${isRich ? 'overflow-x-auto' : 'overflow-hidden'} rounded-2xl border border-[var(--border)] bg-[var(--card)]`}
      >
        <TasksTable
          variant={isRich ? 'rich' : 'simple'}
          tasks={filtered}
          filteredCount={filtered.length}
          totalCount={visibleTasks.length}
          empleadoMap={empleadoMap}
          loading={loading}
          error={error}
          onRowClick={openEdit}
          onCreateEmpty={() => setShowCreate(true)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          sortData={sortData}
          canEditInline={canEditInline}
          completingTaskId={completingTaskId}
          onQuickComplete={handleQuickComplete}
          onOpenUpdates={handleOpenUpdates}
          onInlineEstadoChange={handleInlineEstadoSave}
          onInlineAvanceChange={handleInlineAvanceSave}
          inlineAvance={inlineAvance}
          setInlineAvance={setInlineAvance}
        />
      </div>

      {/* Footer counter (simple only — rich and simple+toggle show their own) */}
      {!isRich && !showHideCompletedToggle && !loading && tasks.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {filtered.length} de {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}
        </p>
      )}

      {/* Create form */}
      <TasksCreateForm
        variant={isRich ? 'rich' : 'simple'}
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setCreateForm(emptyTaskForm());
        }}
        value={createForm}
        onChange={setCreateForm}
        onCreate={handleCreate}
        creating={creating}
        empleados={empleados}
        empleadoOptions={empleadoOptions}
      />

      {/* Edit form */}
      <TasksEditForm
        variant={isRich ? 'rich' : 'simple'}
        open={showEdit}
        onOpenChange={(open) => {
          setShowEdit(open);
          if (!open) setSelectedTask(null);
        }}
        selectedTask={selectedTask}
        value={editForm}
        onChange={setEditForm}
        onSave={handleUpdate}
        saving={saving}
        empleados={empleados}
        empleadoOptions={empleadoOptions}
        empleadoMap={empleadoMap}
        canCompleteTask={canCompleteTask(selectedTask)}
        canModifyTask={canModifyTask(selectedTask)}
        onDelete={handleDelete}
        deleting={deleting}
        updates={taskUpdates}
        loadingUpdates={loadingUpdates}
        updateContent={updateContent}
        onUpdateContentChange={setUpdateContent}
        onSaveUpdate={() => handleSaveUpdate(selectedTask?.id ?? null)}
        savingUpdate={savingUpdate}
      />

      {/* Updates sheet (rich only, standalone) */}
      {isRich && (
        <TasksUpdatesSheet
          open={!!showUpdatesSheet}
          onOpenChange={(open) => {
            if (!open) {
              setShowUpdatesSheet(null);
              setTaskUpdates([]);
              setUpdateContent('');
            }
          }}
          task={updatesSheetTask}
          updates={taskUpdates}
          loadingUpdates={loadingUpdates}
          updateContent={updateContent}
          onUpdateContentChange={setUpdateContent}
          onSaveUpdate={() => handleSaveUpdate(showUpdatesSheet)}
          savingUpdate={savingUpdate}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        title="¿Eliminar esta tarea?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}
