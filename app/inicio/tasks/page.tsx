'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Plus, Search, RefreshCw, Loader2, TicketCheck } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ErpTask = {
  id: string;
  empresa_id: string;
  titulo: string;
  descripcion: string | null;
  asignado_a: string | null;
  creado_por: string | null;
  prioridad_id: string | null;
  estado: 'pendiente' | 'en_progreso' | 'bloqueado' | 'completado' | 'cancelado';
  fecha_vence: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
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
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<ErpTask['estado'], { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  en_progreso: { label: 'En progreso', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  bloqueado:   { label: 'Bloqueado',   cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
  completado:  { label: 'Completado',  cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-[var(--border)]/60 text-[var(--text)]/40 border-[var(--border)]' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Badge components ─────────────────────────────────────────────────────────

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function TasksInner() {
  const supabase = createSupabaseBrowserClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [prioridades, setPrioridades] = useState<Prioridad[]>([]);
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
    prioridad_id: '',
    asignado_a: '',
    estado: 'pendiente',
    fecha_vence: '',
  });

  const fetchRefData = useCallback(async () => {
    const { data } = await supabase
      .schema('shared' as any)
      .from('prioridades')
      .select('*')
      .order('peso');
    setPrioridades(data ?? []);
  }, [supabase]);

  const fetchEmpresasAndEmpleados = useCallback(async (): Promise<string[]> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: coreUser } = await supabase
      .schema('core' as any)
      .from('usuarios')
      .select('id')
      .eq('email', (user.email ?? '').toLowerCase())
      .maybeSingle();

    if (!coreUser) return [];

    const { data: ueData } = await supabase
      .schema('core' as any)
      .from('usuarios_empresas')
      .select('empresa_id')
      .eq('usuario_id', coreUser.id)
      .eq('activo', true);

    const ids = (ueData ?? []).map((r: any) => r.empresa_id as string);
    setEmpresaIds(ids);

    if (ids.length > 0) {
      const { data: empData } = await supabase
        .schema('erp' as any)
        .from('empleados')
        .select('id, persona:persona_id(nombre, apellido_paterno)')
        .in('empresa_id', ids)
        .eq('activo', true)
        .is('deleted_at', null);

      const mapped: Empleado[] = (empData ?? []).map((e: any) => ({
        id: e.id,
        nombre: [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
      }));
      setEmpleados(mapped);
    }

    return ids;
  }, [supabase]);

  const fetchTasks = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setTasks([]);
        return;
      }
      const { data, error: err } = await supabase
        .schema('erp' as any)
        .from('tasks')
        .select('*')
        .in('empresa_id', ids)
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
      const ids = await fetchEmpresasAndEmpleados();
      if (cancelled) return;
      await fetchTasks(ids);
      if (!cancelled) setLoading(false);
    };

    void init();
    return () => { cancelled = true; };
  }, [fetchRefData, fetchEmpresasAndEmpleados, fetchTasks]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchTasks(empresaIds);
    setLoading(false);
  };

  const resetForm = () =>
    setCreateForm({ titulo: '', descripcion: '', prioridad_id: '', asignado_a: '', estado: 'pendiente', fecha_vence: '' });

  const handleCreate = async () => {
    if (!createForm.titulo.trim() || empresaIds.length === 0) return;
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
      empresa_id: empresaIds[0],
      titulo: createForm.titulo.trim(),
      descripcion: createForm.descripcion.trim() || null,
      prioridad_id: createForm.prioridad_id || null,
      asignado_a: createForm.asignado_a || null,
      estado: createForm.estado,
      fecha_vence: createForm.fecha_vence || null,
      creado_por: coreUser?.id ?? null,
    };

    const { error: err } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .insert(payload);

    setCreating(false);

    if (err) {
      alert(`Error al crear tarea: ${err.message}`);
      return;
    }

    setShowCreate(false);
    resetForm();
    await fetchTasks(empresaIds);
  };

  const empleadoMap = new Map(empleados.map((e) => [e.id, e]));
  const prioridadMap = new Map(prioridades.map((p) => [p.id, p]));

  const filtered = tasks.filter((t) => {
    if (search && !t.titulo.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'all' && t.prioridad_id !== filterPrioridad) return false;
    if (filterAsignado !== 'all' && t.asignado_a !== filterAsignado) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Tareas</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Gestión de tareas operativas</p>
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
          <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPrioridad} onValueChange={(v) => setFilterPrioridad(v ?? 'all')}>
            <SelectTrigger className="w-36 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {prioridades.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAsignado} onValueChange={(v) => setFilterAsignado(v ?? 'all')}>
            <SelectTrigger className="w-40 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
              <SelectValue placeholder="Asignado a" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {empleados.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
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
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <TicketCheck className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {tasks.length === 0 ? 'No hay tareas creadas aún' : 'No hay tareas que coincidan con los filtros'}
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
                <TableHead className="font-medium text-[var(--text)]/55">Título</TableHead>
                <TableHead className="w-28 font-medium text-[var(--text)]/55">Estado</TableHead>
                <TableHead className="w-28 font-medium text-[var(--text)]/55">Prioridad</TableHead>
                <TableHead className="w-40 font-medium text-[var(--text)]/55">Asignado a</TableHead>
                <TableHead className="w-28 font-medium text-[var(--text)]/55">Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => {
                const prio = prioridadMap.get(task.prioridad_id ?? '');
                const empleado = empleadoMap.get(task.asignado_a ?? '');
                return (
                  <TableRow key={task.id} className="border-[var(--border)]">
                    <TableCell>
                      <span className="line-clamp-1 font-medium text-[var(--text)]">{task.titulo}</span>
                      {task.entidad_tipo && (
                        <span className="mt-0.5 block text-xs text-[var(--text)]/40">
                          {task.entidad_tipo}
                        </span>
                      )}
                    </TableCell>
                    <TableCell><EstadoBadge estado={task.estado} /></TableCell>
                    <TableCell><PrioridadBadge prioridad={prio} /></TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">
                        {empleado ? empleado.nombre : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/70">{formatDate(task.fecha_vence)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && tasks.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
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
                <Select
                  value={createForm.estado}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, estado: v as ErpTask['estado'] }))}
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
              </div>
              <div>
                <FieldLabel>Prioridad</FieldLabel>
                <Select
                  value={createForm.prioridad_id}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, prioridad_id: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    {prioridades.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Asignado a</FieldLabel>
                <Select
                  value={createForm.asignado_a}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, asignado_a: v ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    {empleados.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              onClick={() => { setShowCreate(false); resetForm(); }}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createForm.titulo.trim()}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
    <RequireAccess empresa="rdb">
      <TasksInner />
    </RequireAccess>
  );
}
