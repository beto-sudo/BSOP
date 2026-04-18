'use client';

/**
 * DepartamentosModule — reusable RH › Departamentos module.
 *
 * Consolidates the previously duplicated pages under
 * `app/rdb/rh/departamentos`, `app/dilesa/rh/departamentos` and
 * `app/rh/departamentos` into one parametrized component.
 *
 * Usage:
 *
 *   // Per-empresa (rdb/dilesa style)
 *   <DepartamentosModule
 *     empresaId="<uuid>"
 *     empresaSlug="rdb"
 *     title="Departamentos — Rincón del Bosque"
 *     showEmpleadosCount
 *   />
 *
 *   // Global / admin (fetches all empresas the user belongs to)
 *   <DepartamentosModule
 *     scope="user-empresas"
 *     empresaSlug=""
 *     title="Departamentos"
 *     createVariant="dialog"
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Loader2, Network } from 'lucide-react';

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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
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
import { RowActions } from '@/components/shared/row-actions';
import { useToast } from '@/components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Departamento = {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  padre_id: string | null;
  activo: boolean;
  padre: { nombre: string } | null;
};

export type DepartamentosModuleProps = {
  /**
   * Single-empresa mode: filter all queries by this empresa_id.
   * Mutually exclusive with `scope="user-empresas"`.
   */
  empresaId?: string;

  /**
   * Scope mode:
   * - omitted or 'empresa' → use `empresaId` (single)
   * - 'user-empresas' → fetch the current user's empresa ids from
   *   core.usuarios_empresas and show all of them (global admin).
   */
  scope?: 'empresa' | 'user-empresas';

  /**
   * URL slug (reserved for future detail routing — departamentos currently
   * has no per-id page, but kept symmetric with EmpleadosModule).
   */
  empresaSlug: string;

  /** Page heading (e.g. "Departamentos — DILESA"). */
  title: string;

  /** Optional subtitle. Defaults to "Estructura organizacional". */
  subtitle?: string;

  /** Use a Sheet (default) or a Dialog for the create/edit form. */
  createVariant?: 'sheet' | 'dialog';

  /** Show extra "Empleados" count column (per-empresa variants). */
  showEmpleadosCount?: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

const EMPTY_FORM = { nombre: '', codigo: '', padre_id: '' };

// ─── Component ───────────────────────────────────────────────────────────────

export function DepartamentosModule({
  empresaId,
  scope = 'empresa',
  empresaSlug: _empresaSlug,
  title,
  subtitle = 'Estructura organizacional',
  createVariant = 'sheet',
  showEmpleadosCount = false,
}: DepartamentosModuleProps) {
  const supabase = createSupabaseERPClient();
  const toast = useToast();

  // In user-empresas mode, empresaIds is resolved at runtime.
  const [empresaIds, setEmpresaIds] = useState<string[]>(
    scope === 'empresa' && empresaId ? [empresaId] : []
  );

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [empleadoCounts, setEmpleadoCounts] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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

  const fetchAll = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setDepartamentos([]);
        setEmpleadoCounts(new Map());
        return;
      }

      const deptQuery = supabase
        .schema('erp')
        .from('departamentos')
        .select('id, empresa_id, nombre, codigo, padre_id, activo, padre:padre_id(nombre)')
        .in('empresa_id', ids)
        .is('deleted_at', null)
        .order('nombre');

      if (showEmpleadosCount) {
        const [deptRes, empRes] = await Promise.all([
          deptQuery,
          supabase
            .schema('erp')
            .from('empleados')
            .select('departamento_id')
            .in('empresa_id', ids)
            .eq('activo', true)
            .is('deleted_at', null),
        ]);
        if (deptRes.error) {
          setError(deptRes.error.message);
          return;
        }
        const normalized = (deptRes.data ?? []).map((d: Record<string, unknown>) => ({
          ...d,
          padre: Array.isArray(d.padre) ? (d.padre[0] ?? null) : d.padre,
        })) as Departamento[];
        setDepartamentos(normalized);
        const counts = new Map<string, number>();
        (empRes.data ?? []).forEach((e: { departamento_id: string | null }) => {
          if (e.departamento_id) {
            counts.set(e.departamento_id, (counts.get(e.departamento_id) ?? 0) + 1);
          }
        });
        setEmpleadoCounts(counts);
      } else {
        const { data, error: err } = await deptQuery;
        if (err) {
          setError(err.message);
          return;
        }
        const normalized = (data ?? []).map((d: Record<string, unknown>) => ({
          ...d,
          padre: Array.isArray(d.padre) ? (d.padre[0] ?? null) : d.padre,
        })) as Departamento[];
        setDepartamentos(normalized);
      }
    },
    [supabase, showEmpleadosCount]
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      const ids = await fetchEmpresaIds();
      if (cancelled) return;
      await fetchAll(ids);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchEmpresaIds, fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };
  const openEdit = (d: Departamento) => {
    setEditingId(d.id);
    setForm({ nombre: d.nombre, codigo: d.codigo ?? '', padre_id: d.padre_id ?? '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return;
    // Pick the empresa for the insert: explicit empresaId wins, else first resolved id.
    const insertEmpresaId = empresaId ?? empresaIds[0];
    if (!editingId && !insertEmpresaId) return;

    setSubmitting(true);
    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      padre_id: form.padre_id || null,
    };

    let err: { message: string } | null = null;
    if (editingId) {
      const res = await supabase
        .schema('erp')
        .from('departamentos')
        .update(payload)
        .eq('id', editingId);
      err = res.error;
    } else {
      const res = await supabase
        .schema('erp')
        .from('departamentos')
        .insert({ ...payload, empresa_id: insertEmpresaId });
      err = res.error;
    }

    setSubmitting(false);
    if (err) {
      toast.add({ title: 'No se pudo guardar', description: err.message, type: 'error' });
      return;
    }
    setShowDialog(false);
    toast.add({
      title: editingId ? 'Departamento actualizado' : 'Departamento creado',
      type: 'success',
    });
    await fetchAll(empresaIds);
  };

  const handleToggleActivo = async (dept: Departamento) => {
    const { error: err } = await supabase
      .schema('erp')
      .from('departamentos')
      .update({ activo: !dept.activo })
      .eq('id', dept.id);
    if (err) {
      toast.add({ title: 'Error al cambiar estado', description: err.message, type: 'error' });
      return;
    }
    toast.add({
      title: dept.activo ? 'Departamento desactivado' : 'Departamento activado',
      type: 'success',
    });
    await fetchAll(empresaIds);
  };

  const handleSoftDelete = async (dept: Departamento) => {
    const { error: err } = await supabase
      .schema('erp')
      .from('departamentos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', dept.id);
    if (err) {
      toast.add({ title: 'No se pudo eliminar', description: err.message, type: 'error' });
      return;
    }
    toast.add({ title: `Departamento "${dept.nombre}" eliminado`, type: 'success' });
    await fetchAll(empresaIds);
  };

  const parentOptions = departamentos.filter((d) => d.id !== editingId && d.activo);

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');

  // Form body shared between Sheet and Dialog variants
  const FormBody = (
    <div className="space-y-4 py-2">
      <div>
        <FieldLabel>Nombre *</FieldLabel>
        <Input
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          placeholder="Ventas, Recursos Humanos..."
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
      <div>
        <FieldLabel>Código</FieldLabel>
        <Input
          value={form.codigo}
          onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
          placeholder="RRHH, VTA..."
          className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
        />
      </div>
      <div>
        <FieldLabel>Departamento padre</FieldLabel>
        <Select
          value={form.padre_id}
          onValueChange={(v) => setForm((f) => ({ ...f, padre_id: v ?? '' }))}
        >
          <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]">
            <SelectValue placeholder="Ninguno (nivel raíz)" />
          </SelectTrigger>
          <SelectContent>
            {parentOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const FormActions = (
    <>
      <Button
        variant="outline"
        onClick={() => setShowDialog(false)}
        className="rounded-xl border-[var(--border)] text-[var(--text)]"
      >
        Cancelar
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={submitting || !form.nombre.trim()}
        className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {editingId ? 'Guardar' : 'Crear'}
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setLoading(true);
              await fetchAll(empresaIds);
              setLoading(false);
            }}
            disabled={loading}
            className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            className="rounded-xl bg-[var(--accent)] text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Nuevo departamento
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </div>
        ) : departamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16">
            <Network className="mb-3 h-10 w-10 text-[var(--text)]/20" />
            <p className="text-sm text-[var(--text)]/55">No hay departamentos registrados</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border)] hover:bg-transparent">
                <SortableHead
                  sortKey="nombre"
                  label="Nombre"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="codigo"
                  label="Código"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-24"
                />
                <SortableHead
                  sortKey="reporta_a_nombre"
                  label="Reporta a"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-36"
                />
                {showEmpleadosCount && (
                  <SortableHead
                    sortKey="emp_count"
                    label="Empleados"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={onSort}
                    className="w-24"
                  />
                )}
                <SortableHead
                  sortKey="activo"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="w-20"
                />
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(
                departamentos.map((d) => ({
                  ...d,
                  reporta_a_nombre: d.padre?.nombre ?? null,
                  emp_count: empleadoCounts.get(d.id) ?? 0,
                }))
              ).map((d) => (
                <TableRow key={d.id} className="border-[var(--border)]">
                  <TableCell>
                    <span className="font-medium text-[var(--text)]">
                      {d.padre_id ? '  └ ' : ''}
                      {d.nombre}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono text-[var(--text)]/60">
                      {d.codigo ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[var(--text)]/70">{d.padre?.nombre ?? '—'}</span>
                  </TableCell>
                  {showEmpleadosCount && (
                    <TableCell>
                      <span className="text-sm text-[var(--text)]/60">
                        {empleadoCounts.get(d.id) ?? 0}
                      </span>
                    </TableCell>
                  )}
                  <TableCell>
                    <span
                      className={[
                        'inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium',
                        d.activo
                          ? 'border-green-500/20 bg-green-500/10 text-green-400'
                          : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]/40',
                      ].join(' ')}
                    >
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      ariaLabel={`Acciones para ${d.nombre}`}
                      onEdit={{ onClick: () => openEdit(d) }}
                      onToggle={{ activo: d.activo, onClick: () => handleToggleActivo(d) }}
                      onDelete={{
                        onConfirm: () => handleSoftDelete(d),
                        confirmTitle: `¿Eliminar "${d.nombre}"?`,
                        confirmDescription:
                          'Esta acción marcará el departamento como eliminado. ' +
                          'Los empleados asignados conservarán su historial y podrá restaurarse desde auditoría.',
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / Edit form — Sheet or Dialog */}
      {createVariant === 'sheet' ? (
        <Sheet open={showDialog} onOpenChange={setShowDialog}>
          <SheetContent
            side="right"
            className="w-full max-w-md border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
          >
            <SheetHeader>
              <SheetTitle>{editingId ? 'Editar departamento' : 'Nuevo departamento'}</SheetTitle>
            </SheetHeader>
            {FormBody}
            <SheetFooter className="gap-2">{FormActions}</SheetFooter>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar departamento' : 'Nuevo departamento'}</DialogTitle>
            </DialogHeader>
            {FormBody}
            <DialogFooter className="gap-2">{FormActions}</DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
