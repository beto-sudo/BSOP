'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
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
import { Plus, Pencil, RefreshCw, Loader2, Network } from 'lucide-react';

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FORM = { nombre: '', codigo: '', padre_id: '' };

function DepartamentosInner() {
  const supabase = createSupabaseERPClient();

  const [empresaIds, setEmpresaIds] = useState<string[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchEmpresaIds = useCallback(async (): Promise<string[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: coreUser } = await supabase
      .schema('core' as any).from('usuarios').select('id')
      .eq('email', (user.email ?? '').toLowerCase()).maybeSingle();
    if (!coreUser) return [];
    const { data: ueData } = await supabase
      .schema('core' as any).from('usuarios_empresas').select('empresa_id')
      .eq('usuario_id', coreUser.id).eq('activo', true);
    const ids = (ueData ?? []).map((r: any) => r.empresa_id as string);
    setEmpresaIds(ids);
    return ids;
  }, [supabase]);

  const fetchAll = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setDepartamentos([]); return; }
    const { data, error: err } = await supabase
      .schema('erp' as any).from('departamentos')
      .select('id, empresa_id, nombre, codigo, padre_id, activo, padre:padre_id(nombre)')
      .in('empresa_id', ids)
      .order('nombre');
    if (err) { setError(err.message); return; }
    // Normalize: Supabase returns the FK join as an array; take first element
    const normalized = (data ?? []).map((d: any) => ({
      ...d,
      padre: Array.isArray(d.padre) ? (d.padre[0] ?? null) : d.padre,
    })) as Departamento[];
    setDepartamentos(normalized);
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

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowDialog(true); };
  const openEdit = (d: Departamento) => {
    setEditingId(d.id);
    setForm({ nombre: d.nombre, codigo: d.codigo ?? '', padre_id: d.padre_id ?? '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim() || empresaIds.length === 0) return;
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      padre_id: form.padre_id || null,
    };

    let err: { message: string } | null = null;
    if (editingId) {
      const res = await supabase.schema('erp' as any).from('departamentos').update(payload).eq('id', editingId);
      err = res.error;
    } else {
      const res = await supabase.schema('erp' as any).from('departamentos').insert({ ...payload, empresa_id: empresaIds[0] });
      err = res.error;
    }

    setSubmitting(false);
    if (err) { alert(`Error: ${err.message}`); return; }
    setShowDialog(false);
    await fetchAll(empresaIds);
  };

  const handleToggleActivo = async (dept: Departamento) => {
    await supabase.schema('erp' as any).from('departamentos').update({ activo: !dept.activo }).eq('id', dept.id);
    await fetchAll(empresaIds);
  };

  // Exclude self from padre_id options when editing
  const parentOptions = departamentos.filter((d) => d.id !== editingId && d.activo);

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Departamentos</h1>
          <p className="mt-1 text-sm text-[var(--text)]/55">Estructura organizacional</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={async () => { setLoading(true); await fetchAll(empresaIds); setLoading(false); }} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate} className="rounded-xl bg-[var(--accent)] text-white gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo departamento
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (
          <div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-20 ml-auto" /></div>
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
                <SortableHead sortKey="nombre" label="Nombre" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                <SortableHead sortKey="codigo" label="Código" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
                <SortableHead sortKey="reporta_a_nombre" label="Reporta a" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
                <SortableHead sortKey="activo" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-20" />
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortData(departamentos.map((d) => ({ ...d, reporta_a_nombre: d.padre?.nombre ?? null }))).map((d) => (
                <TableRow key={d.id} className="border-[var(--border)]">
                  <TableCell>
                    <span className="font-medium text-[var(--text)]">
                      {d.padre_id ? '  └ ' : ''}{d.nombre}
                    </span>
                  </TableCell>
                  <TableCell><span className="text-sm font-mono text-[var(--text)]/60">{d.codigo ?? '—'}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/70">{d.padre?.nombre ?? '—'}</span></TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleActivo(d)}
                      className={[
                        'inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium transition',
                        d.activo
                          ? 'border-green-500/20 bg-green-500/10 text-green-400'
                          : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]/40',
                      ].join(' ')}
                    >
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => openEdit(d)} className="rounded-xl h-7 w-7 p-0 border-[var(--border)]">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar departamento' : 'Nuevo departamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FieldLabel>Nombre *</FieldLabel>
              <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ventas, Recursos Humanos..." className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
            </div>
            <div>
              <FieldLabel>Código</FieldLabel>
              <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="RRHH, VTA..." className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" />
            </div>
            <div>
              <FieldLabel>Departamento padre</FieldLabel>
              <Select value={form.padre_id} onValueChange={(v) => setForm((f) => ({ ...f, padre_id: v ?? '' }))}>
                <SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Ninguno (nivel raíz)" /></SelectTrigger>
                <SelectContent>
                  {parentOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl border-[var(--border)] text-[var(--text)]">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.nombre.trim()} className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Guardar' : 'Crear'}
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
      <DepartamentosInner />
    </RequireAccess>
  );
}
