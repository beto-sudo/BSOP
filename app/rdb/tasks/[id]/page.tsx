'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect --
 * Cleanup PR (#30): pre-existing debt. `any` in Supabase row mapping;
 * set-state-in-effect in data-sync pattern. Both are behavioral rewrites,
 * out of scope for bulk lint cleanup.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Save, Pencil, X, Check, AlertTriangle, Plus } from 'lucide-react';

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
  tipo: 'avance' | 'cambio_estado' | 'cambio_fecha' | 'nota' | 'cambio_responsable';
  contenido: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  creado_por: string | null;
  created_at: string;
  usuario?: { nombre: string } | null;
};

import { ESTADO_CONFIG } from '@/components/tasks/tasks-shared';

const PRIORIDAD_CONFIG: Record<string, { label: string; cls: string }> = {
  Urgente: { label: 'Urgente', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  Alta: { label: 'Alta', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  Media: { label: 'Media', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  Baja: { label: 'Baja', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
};

const PRIORIDAD_OPTIONS = ['Urgente', 'Alta', 'Media', 'Baja'] as const;

const TIPO_UPDATE_CONFIG: Record<string, { label: string; cls: string }> = {
  avance: { label: 'Avance', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  cambio_estado: { label: 'Estado', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  cambio_fecha: { label: 'Fecha', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  nota: {
    label: 'Nota',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/60 border-[var(--border)]',
  },
  cambio_responsable: {
    label: 'Responsable',
    cls: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TaskDetailInner() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [task, setTask] = useState<ErpTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [editingTitulo, setEditingTitulo] = useState(false);
  const [tituloVal, setTituloVal] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const tituloRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const [taskUpdates, setTaskUpdates] = useState<TaskUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  const [showUpdateSheet, setShowUpdateSheet] = useState(false);
  const [sendingUpdate, setSendingUpdate] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    contenido: '',
    nuevoEstado: '',
    nuevaFecha: '',
  });

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

  const fetchCurrentUser = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return;
    const { data: coreUser } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    setCurrentUserId(coreUser?.id ?? null);
  }, [supabase]);

  const fetchTask = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('erp')
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();
    if (err || !data) {
      setError(err?.message ?? 'Tarea no encontrada');
      return null;
    }
    setTask(data as ErpTask);
    return data as ErpTask;
  }, [supabase, taskId]);

  const fetchUpdates = useCallback(async () => {
    setUpdatesLoading(true);
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
    setUpdatesLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const init = async () => {
      await Promise.all([fetchRefData(), fetchCurrentUser()]);
      const taskData = await fetchTask();
      if (cancelled || !taskData) return;
      await fetchUpdates();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchRefData, fetchTask, fetchUpdates, fetchCurrentUser]);

  useEffect(() => {
    if (editingTitulo) tituloRef.current?.focus();
  }, [editingTitulo]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const patchTask = useCallback(
    async (updates: Partial<ErpTask>) => {
      if (!task) return;
      setSaving(true);
      const { data, error: err } = await supabase
        .schema('erp')
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .select()
        .single();
      setSaving(false);
      if (!err && data) setTask(data as ErpTask);
    },
    [supabase, task]
  );

  const saveTitulo = async () => {
    if (!tituloVal.trim()) return;
    setEditingTitulo(false);
    await patchTask({ titulo: tituloVal.trim() });
  };

  const saveDesc = async () => {
    setEditingDesc(false);
    await patchTask({ descripcion: descVal.trim() || null });
  };

  const handleSendUpdate = async () => {
    if (!updateForm.contenido.trim() && !updateForm.nuevoEstado && !updateForm.nuevaFecha) return;
    if (!task) return;
    setSendingUpdate(true);

    const inserts: any[] = [];

    if (updateForm.contenido.trim()) {
      inserts.push({
        task_id: taskId,
        empresa_id: EMPRESA_ID,
        tipo: 'avance',
        contenido: updateForm.contenido.trim(),
        creado_por: currentUserId,
      });
    }

    if (updateForm.nuevoEstado && updateForm.nuevoEstado !== task.estado) {
      inserts.push({
        task_id: taskId,
        empresa_id: EMPRESA_ID,
        tipo: 'cambio_estado',
        valor_anterior: task.estado,
        valor_nuevo: updateForm.nuevoEstado,
        creado_por: currentUserId,
      });
    }

    if (updateForm.nuevaFecha && updateForm.nuevaFecha !== (task.fecha_vence ?? '')) {
      inserts.push({
        task_id: taskId,
        empresa_id: EMPRESA_ID,
        tipo: 'cambio_fecha',
        valor_anterior: task.fecha_vence ?? '',
        valor_nuevo: updateForm.nuevaFecha,
        creado_por: currentUserId,
      });
    }

    if (inserts.length > 0) {
      await supabase.schema('erp').from('task_updates').insert(inserts);
    }

    const taskPatch: Partial<ErpTask> = {};
    if (updateForm.nuevoEstado && updateForm.nuevoEstado !== task.estado) {
      taskPatch.estado = updateForm.nuevoEstado as ErpTask['estado'];
    }
    if (updateForm.nuevaFecha && updateForm.nuevaFecha !== (task.fecha_vence ?? '')) {
      taskPatch.fecha_vence = updateForm.nuevaFecha;
    }
    if (Object.keys(taskPatch).length > 0) {
      await patchTask(taskPatch);
    }

    setUpdateForm({ contenido: '', nuevoEstado: '', nuevaFecha: '' });
    setShowUpdateSheet(false);
    await fetchUpdates();
    if (Object.keys(taskPatch).length > 0) {
      await fetchTask();
    }
    setSendingUpdate(false);
  };

  const empleadoMap = new Map(empleados.map((e) => [e.id, e]));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-red-400" />
        <p className="text-[var(--text)]/70">{error ?? 'Tarea no encontrada'}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/rdb/tasks')}
          className="mt-4 rounded-xl border-[var(--border)] text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Tareas
        </Button>
      </div>
    );
  }

  const asignado = empleadoMap.get(task.asignado_a ?? '');
  const estadoCfg = ESTADO_CONFIG[task.estado] ?? { label: task.estado, cls: '' };

  return (
    <div className="space-y-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/rdb/tasks')}
          className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:bg-[var(--panel)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Tareas
        </Button>
        <span className="text-[var(--text)]/30">/</span>
        <span className="text-sm text-[var(--text)]/55 line-clamp-1 max-w-xs">{task.titulo}</span>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text)]/40 ml-1" />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Titulo */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${estadoCfg.cls}`}
                >
                  {estadoCfg.label}
                </span>
                {task.entidad_tipo && (
                  <span className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--text)]/60">
                    {task.entidad_tipo}
                  </span>
                )}
              </div>
              {!editingTitulo && (
                <button
                  onClick={() => {
                    setTituloVal(task.titulo);
                    setEditingTitulo(true);
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text)]/30 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingTitulo ? (
              <div className="flex gap-2">
                <Input
                  ref={tituloRef}
                  value={tituloVal}
                  onChange={(e) => setTituloVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveTitulo();
                    if (e.key === 'Escape') setEditingTitulo(false);
                  }}
                  className="flex-1 rounded-xl border-[var(--border)] bg-[var(--panel)] text-lg font-semibold text-[var(--text)]"
                />
                <Button
                  size="sm"
                  onClick={saveTitulo}
                  className="rounded-xl bg-[var(--accent)] text-white"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingTitulo(false)}
                  className="rounded-xl border-[var(--border)]"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <h1 className="text-xl font-semibold text-[var(--text)] leading-snug">
                {task.titulo}
              </h1>
            )}
          </div>

          {/* Descripcion */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Descripción</FieldLabel>
              {!editingDesc && (
                <button
                  onClick={() => {
                    setDescVal(task.descripcion ?? '');
                    setEditingDesc(true);
                  }}
                  className="rounded-lg p-1.5 text-[var(--text)]/30 transition hover:bg-[var(--panel)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingDesc ? (
              <div className="space-y-2">
                <Textarea
                  ref={descRef}
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  rows={6}
                  placeholder="Agrega una descripción..."
                  className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={saveDesc}
                    className="gap-1.5 rounded-xl bg-[var(--accent)] text-white"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDesc(false)}
                    className="rounded-xl border-[var(--border)]"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : task.descripcion ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/75">
                {task.descripcion}
              </p>
            ) : (
              <button
                onClick={() => {
                  setDescVal('');
                  setEditingDesc(true);
                }}
                className="text-sm italic text-[var(--text)]/35 hover:text-[var(--text)]/55 transition-colors"
              >
                Sin descripción. Haz clic para agregar.
              </button>
            )}
          </div>

          {/* Actualizaciones */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <FieldLabel>Actualizaciones ({taskUpdates.length})</FieldLabel>
              <Button
                size="sm"
                onClick={() => setShowUpdateSheet(true)}
                className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar avance
              </Button>
            </div>

            {updatesLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : taskUpdates.length === 0 ? (
              <p className="text-sm italic text-[var(--text)]/35">Sin actualizaciones aún.</p>
            ) : (
              <div className="space-y-3">
                {taskUpdates.map((u) => {
                  const tc = TIPO_UPDATE_CONFIG[u.tipo] ?? { label: u.tipo, cls: '' };
                  return (
                    <div
                      key={u.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
                    >
                      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-medium ${tc.cls}`}
                        >
                          {tc.label}
                        </span>
                        <span className="text-[10px] text-[var(--text)]/40">
                          {u.usuario?.nombre ?? 'Sistema'}
                        </span>
                        <span className="text-[10px] text-[var(--text)]/30 ml-auto">
                          {formatDateTime(u.created_at)}
                        </span>
                      </div>
                      {u.contenido && (
                        <p className="whitespace-pre-wrap text-sm text-[var(--text)]/80">
                          {u.contenido}
                        </p>
                      )}
                      {u.valor_anterior != null && u.valor_nuevo != null && (
                        <p className="text-xs text-[var(--text)]/50 mt-1">
                          {u.tipo === 'cambio_estado'
                            ? `${ESTADO_CONFIG[u.valor_anterior as ErpTask['estado']]?.label ?? u.valor_anterior} → ${ESTADO_CONFIG[u.valor_nuevo as ErpTask['estado']]?.label ?? u.valor_nuevo}`
                            : `${u.valor_anterior || '—'} → ${u.valor_nuevo || '—'}`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Estado */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={task.estado}
              onValueChange={(v) => void patchTask({ estado: v as ErpTask['estado'] })}
            >
              <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                <SelectValue>
                  <span
                    className={`inline-flex items-center gap-1.5 ${estadoCfg.cls.includes('text-') ? estadoCfg.cls.split(' ').find((c: string) => c.startsWith('text-')) : ''}`}
                  >
                    {estadoCfg.label}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metadata */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
            <div>
              <FieldLabel>Prioridad</FieldLabel>
              <Select
                value={task.prioridad ?? ''}
                onValueChange={(v) => void patchTask({ prioridad: v || null } as any)}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin prioridad">
                    {task.prioridad ? (
                      <span
                        className={`inline-flex items-center gap-1.5 ${PRIORIDAD_CONFIG[task.prioridad]?.cls.split(' ').find((c: string) => c.startsWith('text-')) ?? ''}`}
                      >
                        {task.prioridad}
                      </span>
                    ) : (
                      <span className="text-[var(--text)]/40">Sin prioridad</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin prioridad</SelectItem>
                  {PRIORIDAD_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div>
              <FieldLabel>Asignado a</FieldLabel>
              <Select
                value={task.asignado_a ?? ''}
                onValueChange={(v) => void patchTask({ asignado_a: v || null })}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin asignar">
                    {asignado ? (
                      asignado.nombre
                    ) : (
                      <span className="text-[var(--text)]/40">Sin asignar</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {empleados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-[var(--border)]" />

            <div>
              <FieldLabel>Fecha límite</FieldLabel>
              <Input
                type="date"
                value={task.fecha_vence?.substring(0, 10) ?? ''}
                onChange={(e) => void patchTask({ fecha_vence: e.target.value || null })}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            {task.porcentaje_avance != null && task.porcentaje_avance > 0 && (
              <>
                <Separator className="bg-[var(--border)]" />
                <div>
                  <FieldLabel>Avance</FieldLabel>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-[var(--panel)]">
                      <div
                        className="h-2 rounded-full bg-[var(--accent)]"
                        style={{ width: `${task.porcentaje_avance}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-[var(--text)]/60">
                      {task.porcentaje_avance}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text)]/45">Creado</span>
              <span className="text-[var(--text)]/70">{formatDate(task.created_at)}</span>
            </div>
            {task.updated_at && (
              <div className="flex justify-between">
                <span className="text-[var(--text)]/45">Actualizado</span>
                <span className="text-[var(--text)]/70">{formatDate(task.updated_at)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Update Sheet */}
      <Sheet open={showUpdateSheet} onOpenChange={setShowUpdateSheet}>
        <SheetContent className="border-[var(--border)] bg-[var(--card)] text-[var(--text)] sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-[var(--text)]">Agregar avance</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div>
              <FieldLabel>Contenido del avance</FieldLabel>
              <Textarea
                placeholder="Describe el avance o nota..."
                value={updateForm.contenido}
                onChange={(e) => setUpdateForm((f) => ({ ...f, contenido: e.target.value }))}
                rows={4}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <div>
              <FieldLabel>Cambiar estado (opcional)</FieldLabel>
              <Select
                value={updateForm.nuevoEstado}
                onValueChange={(v) => setUpdateForm((f) => ({ ...f, nuevoEstado: v ?? '' }))}
              >
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Sin cambio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin cambio</SelectItem>
                  {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel>Cambiar fecha límite (opcional)</FieldLabel>
              <Input
                type="date"
                value={updateForm.nuevaFecha}
                onChange={(e) => setUpdateForm((f) => ({ ...f, nuevaFecha: e.target.value }))}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>

            <Button
              onClick={handleSendUpdate}
              disabled={
                sendingUpdate ||
                (!updateForm.contenido.trim() && !updateForm.nuevoEstado && !updateForm.nuevaFecha)
              }
              className="w-full gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {sendingUpdate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar avance
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.tasks">
      <TaskDetailInner />
    </RequireAccess>
  );
}
