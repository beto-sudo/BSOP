'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
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
import { Plus, Search, RefreshCw, Loader2, Users, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Empleado = {
  id: string;
  empresa_id: string;
  numero_empleado: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  activo: boolean;
  persona: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; email: string | null } | null;
  departamento: { nombre: string } | null;
  puesto: { nombre: string } | null;
};

type Persona = { id: string; nombre: string; apellido_paterno: string | null };
type Departamento = { id: string; nombre: string };
type Puesto = { id: string; nombre: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(emp: Empleado) {
  if (!emp.persona) return '—';
  return [emp.persona.nombre, emp.persona.apellido_paterno, emp.persona.apellido_materno]
    .filter(Boolean)
    .join(' ');
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d.includes('T') ? d : `${d}T00:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function EmpleadosInner() {
  const router = useRouter();
  const supabase = createSupabaseERPClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'activos' | 'inactivos'>('activos');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    persona_id: '',
    departamento_id: '',
    puesto_id: '',
    numero_empleado: '',
    fecha_ingreso: '',
  });

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    const { data: { user } } = await supabase.auth.getUser();
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
    return ids;
  }, [supabase]);

  const fetchAll = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setEmpleados([]); return; }

    const [empRes, personasRes, deptRes, puestosRes] = await Promise.all([
      supabase
        .schema('erp' as any)
        .from('empleados')
        .select('id, empresa_id, numero_empleado, fecha_ingreso, fecha_baja, activo, persona:persona_id(nombre, apellido_paterno, apellido_materno, email), departamento:departamento_id(nombre), puesto:puesto_id(nombre)')
        .in('empresa_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .schema('erp' as any)
        .from('personas')
        .select('id, nombre, apellido_paterno')
        .in('empresa_id', ids)
        .eq('activo', true)
        .is('deleted_at', null)
        .order('nombre'),
      supabase
        .schema('erp' as any)
        .from('departamentos')
        .select('id, nombre')
        .in('empresa_id', ids)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .schema('erp' as any)
        .from('puestos')
        .select('id, nombre')
        .in('empresa_id', ids)
        .eq('activo', true)
        .order('nombre'),
    ]);

    if (empRes.error) { setError(empRes.error.message); return; }
    const normalizedEmps = (empRes.data ?? []).map((e: any) => ({
      ...e,
      persona: Array.isArray(e.persona) ? (e.persona[0] ?? null) : e.persona,
      departamento: Array.isArray(e.departamento) ? (e.departamento[0] ?? null) : e.departamento,
      puesto: Array.isArray(e.puesto) ? (e.puesto[0] ?? null) : e.puesto,
    })) as Empleado[];
    setEmpleados(normalizedEmps);
    setPersonas(personasRes.data ?? []);
    setDepartamentos(deptRes.data ?? []);
    setPuestos(puestosRes.data ?? []);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchAll(ids);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [fetchEmpresaIds, fetchAll]);

  const handleCreate = async () => {
    if (!createForm.persona_id || empresaIds.length === 0) return;
    setCreating(true);
    const payload: Record<string, unknown> = {
      empresa_id: empresaIds[0],
      persona_id: createForm.persona_id,
      departamento_id: createForm.departamento_id || null,
      puesto_id: createForm.puesto_id || null,
      numero_empleado: createForm.numero_empleado.trim() || null,
      fecha_ingreso: createForm.fecha_ingreso || null,
      activo: true,
    };
    const { data: newEmp, error: err } = await supabase
      .schema('erp' as any)
      .from('empleados')
      .insert(payload)
      .select()
      .single();
    setCreating(false);
    if (err) { alert(`Error al crear empleado: ${err.message}`); return; }
    setShowCreate(false);
    setCreateForm({ persona_id: '', departamento_id: '', puesto_id: '', numero_empleado: '', fecha_ingreso: '' });
    if (newEmp) router.push(`/rh/empleados/${newEmp.id}`);
  };

  const visible = empleados.filter((e) => {
    const isActive = e.activo && !e.fecha_baja;
    if (tab === 'activos' && !isActive) return false;
    if (tab === 'inactivos' && isActive) return false;
    if (search) {
      const name = fullName(e).toLowerCase();
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Empleados</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Directorio de personal</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { setLoading(true); await fetchAll(empresaIds); setLoading(false); }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </Button>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 gap-1">
            {(['activos', 'inactivos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  'rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition',
                  tab === t
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text)]/60 hover:text-[var(--text)]',
                ].join(' ')}
              >
                {t === 'activos' ? 'Activos' : 'Ex-empleados'}
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-28 ml-auto" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <Users className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">
              {empleados.length === 0 ? 'No hay empleados registrados' : 'Sin resultados para los filtros actuales'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead sortKey="nombre" label="Nombre" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="departamento_nombre" label="Departamento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
                <SortableHead sortKey="puesto_nombre" label="Puesto" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
                <SortableHead sortKey="fecha_ingreso" label="Ingreso" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(visible.map((emp) => ({ ...emp, nombre: fullName(emp) || null, departamento_nombre: emp.departamento?.nombre ?? null, puesto_nombre: emp.puesto?.nombre ?? null }))).map((emp) => (
                <TableRow
                  key={emp.id}
                  className="cursor-pointer border-[var(--border)] hover:bg-[var(--panel)] transition-colors"
                  onClick={() => router.push(`/rh/empleados/${emp.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-semibold text-[var(--accent)]">
                        {(emp.persona?.nombre?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-[var(--text)]">{fullName(emp)}</div>
                        {emp.persona?.email && (
                          <div className="text-xs text-[var(--text)]/50">{emp.persona.email}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">{emp.departamento?.nombre ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">{emp.puesto?.nombre ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">{formatDate(emp.fecha_ingreso)}</span>
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

      {!loading && empleados.length > 0 && (
        <p className="text-right text-xs text-[var(--text)]/40">
          {visible.length} de {empleados.length} empleado{empleados.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--text)]">Nuevo empleado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Persona *</FieldLabel>
              <Select value={createForm.persona_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, persona_id: v ?? '' }))}>
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                  <SelectValue placeholder="Seleccionar persona..." />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.nombre, p.apellido_paterno].filter(Boolean).join(' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Departamento</FieldLabel>
                <Select value={createForm.departamento_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, departamento_id: v ?? '' }))}>
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>Puesto</FieldLabel>
                <Select value={createForm.puesto_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, puesto_id: v ?? '' }))}>
                  <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
                    <SelectValue placeholder="Sin puesto" />
                  </SelectTrigger>
                  <SelectContent>
                    {puestos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>No. Empleado</FieldLabel>
                <Input
                  placeholder="Ej: EMP-001"
                  value={createForm.numero_empleado}
                  onChange={(e) => setCreateForm((f) => ({ ...f, numero_empleado: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
              <div>
                <FieldLabel>Fecha de ingreso</FieldLabel>
                <Input
                  type="date"
                  value={createForm.fecha_ingreso}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fecha_ingreso: e.target.value }))}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border-[var(--border)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createForm.persona_id}
              className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <EmpleadosInner />
    </RequireAccess>
  );
}
