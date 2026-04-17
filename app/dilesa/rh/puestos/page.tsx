'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RowActions } from '@/components/shared/row-actions';
import { useToast } from '@/components/ui/toast';
import { Plus, RefreshCw, Loader2, Briefcase } from 'lucide-react';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

type Puesto = {
  id: string; empresa_id: string; nombre: string; nivel: string | null;
  sueldo_min: number | null; sueldo_max: number | null; objetivo: string | null;
  perfil: string | null; requisitos: string | null; esquema_pago: string | null;
  reporta_a: string | null; activo: boolean; departamento: { nombre: string } | null;
};
type Departamento = { id: string; nombre: string };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 mb-1.5">{children}</div>;
}

const EMPTY_FORM = { nombre: '', nivel: '', departamento_id: '', sueldo_min: '', sueldo_max: '', objetivo: '', perfil: '', requisitos: '', esquema_pago: '', reporta_a: '' };

function PuestosInner() {
  const supabase = createSupabaseERPClient();
  const toast = useToast();
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [empleadoCounts, setEmpleadoCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDepto, setFilterDepto] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchAll = useCallback(async () => {
    const [pRes, dRes, empRes] = await Promise.all([
      supabase.schema('erp').from('puestos')
        .select('id, empresa_id, nombre, nivel, sueldo_min, sueldo_max, objetivo, perfil, requisitos, esquema_pago, reporta_a, activo, departamento:departamento_id(nombre)')
        .eq('empresa_id', EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre'),
      supabase.schema('erp').from('departamentos').select('id, nombre').eq('empresa_id', EMPRESA_ID).eq('activo', true)
        .is('deleted_at', null).order('nombre'),
      supabase.schema('erp').from('empleados').select('puesto_id').eq('empresa_id', EMPRESA_ID).eq('activo', true).is('deleted_at', null),
    ]);
    if (pRes.error) { setError(pRes.error.message); return; }
    setPuestos((pRes.data ?? []).map((p: any) => ({ ...p, departamento: Array.isArray(p.departamento) ? (p.departamento[0] ?? null) : p.departamento })) as Puesto[]);
    setDepartamentos(dRes.data ?? []);
    const counts = new Map<string, number>();
    (empRes.data ?? []).forEach((e: { puesto_id: string | null }) => {
      if (e.puesto_id) counts.set(e.puesto_id, (counts.get(e.puesto_id) ?? 0) + 1);
    });
    setEmpleadoCounts(counts);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const init = async () => { await fetchAll(); if (!cancelled) setLoading(false); };
    void init();
    return () => { cancelled = true; };
  }, [fetchAll]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowDialog(true); };
  const openEdit = (p: Puesto) => {
    setEditingId(p.id);
    setForm({ nombre: p.nombre, nivel: p.nivel ?? '', departamento_id: '', sueldo_min: p.sueldo_min != null ? String(p.sueldo_min) : '', sueldo_max: p.sueldo_max != null ? String(p.sueldo_max) : '', objetivo: p.objetivo ?? '', perfil: p.perfil ?? '', requisitos: p.requisitos ?? '', esquema_pago: p.esquema_pago ?? '', reporta_a: p.reporta_a ?? '' });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) return;
    setSubmitting(true);
    const payload = {
      nombre: form.nombre.trim(), nivel: form.nivel.trim() || null, departamento_id: form.departamento_id || null,
      sueldo_min: form.sueldo_min ? parseFloat(form.sueldo_min) : null, sueldo_max: form.sueldo_max ? parseFloat(form.sueldo_max) : null,
      objetivo: form.objetivo.trim() || null, perfil: form.perfil.trim() || null, requisitos: form.requisitos.trim() || null,
      esquema_pago: form.esquema_pago.trim() || null, reporta_a: form.reporta_a || null,
    };
    let err: { message: string } | null = null;
    if (editingId) { const res = await supabase.schema('erp').from('puestos').update(payload).eq('id', editingId); err = res.error; }
    else { const res = await supabase.schema('erp').from('puestos').insert({ ...payload, empresa_id: EMPRESA_ID }); err = res.error; }
    setSubmitting(false);
    if (err) {
      toast.add({ title: 'No se pudo guardar', description: err.message, type: 'error' });
      return;
    }
    setShowDialog(false);
    toast.add({
      title: editingId ? 'Puesto actualizado' : 'Puesto creado',
      type: 'success',
    });
    await fetchAll();
  };

  const handleToggleActivo = async (p: Puesto) => {
    const { error: err } = await supabase
      .schema('erp').from('puestos')
      .update({ activo: !p.activo })
      .eq('id', p.id);
    if (err) {
      toast.add({ title: 'Error al cambiar estado', description: err.message, type: 'error' });
      return;
    }
    toast.add({
      title: p.activo ? 'Puesto desactivado' : 'Puesto activado',
      type: 'success',
    });
    await fetchAll();
  };

  const handleSoftDelete = async (p: Puesto) => {
    const { error: err } = await supabase
      .schema('erp').from('puestos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', p.id);
    if (err) {
      toast.add({ title: 'No se pudo eliminar', description: err.message, type: 'error' });
      return;
    }
    toast.add({ title: `Puesto "${p.nombre}" eliminado`, type: 'success' });
    await fetchAll();
  };

  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Puestos — DILESA</h1><p className="mt-1 text-sm text-[var(--text)]/55">Catálogo de puestos y perfiles de puesto</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={async () => { setLoading(true); await fetchAll(); setLoading(false); }} disabled={loading} className="rounded-xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" onClick={openCreate} className="rounded-xl bg-[var(--accent)] text-white gap-1.5"><Plus className="h-4 w-4" /> Nuevo puesto</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <Select value={filterDepto} onValueChange={(v) => setFilterDepto(v ?? 'all')}>
            <SelectTrigger className="w-44 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Departamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los deptos</SelectItem>
              {departamentos.map((d) => <SelectItem key={d.id} value={d.nombre}>{d.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {error ? (<div className="flex items-center justify-center p-16 text-red-400">Error: {error}</div>
        ) : loading ? (<div className="divide-y divide-[var(--border)]">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="flex gap-4 p-4"><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-32 ml-auto" /></div>))}</div>
        ) : puestos.filter((p) => filterDepto === 'all' || p.departamento?.nombre === filterDepto).length === 0 ? (<div className="flex flex-col items-center justify-center p-16"><Briefcase className="mb-3 h-10 w-10 text-[var(--text)]/20" /><p className="text-sm text-[var(--text)]/55">No hay puestos registrados</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow className="border-[var(--border)] hover:bg-transparent">
              <SortableHead sortKey="nombre" label="Nombre" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableHead sortKey="nivel" label="Nivel" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-28" />
              <SortableHead sortKey="departamento_nombre" label="Departamento" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-36" />
              <SortableHead sortKey="sueldo_min" label="Rango salarial" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-40" />
              <SortableHead sortKey="emp_count" label="Empleados" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-24" />
              <SortableHead sortKey="esquema_pago" label="Esquema pago" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-32" />
              <SortableHead sortKey="activo" label="Estado" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-20" />
              <TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {sortData(puestos.filter((p) => filterDepto === 'all' || p.departamento?.nombre === filterDepto).map((p) => ({ ...p, departamento_nombre: p.departamento?.nombre ?? null, emp_count: empleadoCounts.get(p.id) ?? 0 }))).map((p) => {
                const salaryRange = p.sueldo_min != null || p.sueldo_max != null
                  ? `$${(p.sueldo_min ?? 0).toLocaleString('es-MX')} – $${(p.sueldo_max ?? 0).toLocaleString('es-MX')}`
                  : '—';
                return (
                <TableRow key={p.id} className="border-[var(--border)]">
                  <TableCell><span className="font-medium text-[var(--text)]">{p.nombre}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/70">{p.nivel ?? '—'}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/70">{p.departamento?.nombre ?? '—'}</span></TableCell>
                  <TableCell><span className="text-xs font-mono text-[var(--text)]/60">{salaryRange}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/60">{empleadoCounts.get(p.id) ?? 0}</span></TableCell>
                  <TableCell><span className="text-sm text-[var(--text)]/70">{p.esquema_pago ?? '—'}</span></TableCell>
                  <TableCell>
                    <span className={['inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium', p.activo ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)]/40'].join(' ')}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </TableCell>
                  <TableCell>
                    <RowActions
                      ariaLabel={`Acciones para ${p.nombre}`}
                      onEdit={{ onClick: () => openEdit(p) }}
                      onToggle={{ activo: p.activo, onClick: () => handleToggleActivo(p) }}
                      onDelete={{
                        onConfirm: () => handleSoftDelete(p),
                        confirmTitle: `¿Eliminar "${p.nombre}"?`,
                        confirmDescription:
                          'Esta acción marcará el puesto como eliminado. ' +
                          'Los empleados asignados conservarán su historial y podrá restaurarse desde auditoría.',
                      }}
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={showDialog} onOpenChange={setShowDialog}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <SheetHeader><SheetTitle>{editingId ? 'Editar puesto' : 'Nuevo puesto'}</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4">
            <div><FieldLabel>Nombre *</FieldLabel><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Director Comercial..." className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Nivel</FieldLabel><Input value={form.nivel} onChange={(e) => setForm((f) => ({ ...f, nivel: e.target.value }))} placeholder="Senior, Jr, C-Level..." className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
              <div><FieldLabel>Departamento</FieldLabel><Select value={form.departamento_id} onValueChange={(v) => setForm((f) => ({ ...f, departamento_id: v ?? '' }))}><SelectTrigger className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"><SelectValue placeholder="Sin departamento" /></SelectTrigger><SelectContent>{departamentos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Sueldo mínimo</FieldLabel><Input type="number" value={form.sueldo_min} onChange={(e) => setForm((f) => ({ ...f, sueldo_min: e.target.value }))} placeholder="0.00" className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
              <div><FieldLabel>Sueldo máximo</FieldLabel><Input type="number" value={form.sueldo_max} onChange={(e) => setForm((f) => ({ ...f, sueldo_max: e.target.value }))} placeholder="0.00" className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            </div>
            <div><FieldLabel>Esquema de pago</FieldLabel><Input value={form.esquema_pago} onChange={(e) => setForm((f) => ({ ...f, esquema_pago: e.target.value }))} placeholder="Mensual, quincenal, honorarios..." className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]" /></div>
            <div><FieldLabel>Objetivo del puesto</FieldLabel><Textarea value={form.objetivo} onChange={(e) => setForm((f) => ({ ...f, objetivo: e.target.value }))} placeholder="Objetivo principal..." rows={3} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] resize-none" /></div>
            <div><FieldLabel>Perfil</FieldLabel><Textarea value={form.perfil} onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value }))} placeholder="Competencias, habilidades..." rows={3} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] resize-none" /></div>
            <div><FieldLabel>Requisitos</FieldLabel><Textarea value={form.requisitos} onChange={(e) => setForm((f) => ({ ...f, requisitos: e.target.value }))} placeholder="Escolaridad, experiencia..." rows={3} className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] resize-none" /></div>
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl border-[var(--border)] text-[var(--text)]">Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.nombre.trim()} className="gap-1.5 rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editingId ? 'Guardar' : 'Crear'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <PuestosInner />
    </RequireAccess>
  );
}
