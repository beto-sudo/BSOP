'use client';

/**
 * Panel "Cuadro accionario" para `/settings/empresas/[slug]`.
 *
 * Iniciativa `gobierno-corporativo` · Sprint 2. Llena el tab que antes era
 * placeholder. CRUD de `core.empresa_socios`: socios con % de participación,
 * familia controladora, y liga opcional a una empresa BSOP (p.ej. Nigropetense
 * es a la vez `core.empresas`).
 *
 * Acceso: la página es admin-only (`<RequireAccess adminOnly>`); las escrituras
 * van directo por el browser client (la RLS de `core.empresa_socios` exige
 * admin para UPDATE/DELETE). No se fuerza `Σ% = 100` en DB — se avisa en UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Badge } from '@/components/ui/badge';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  type Socio,
  type TipoSocio,
  type CapTableStatus,
  TIPO_SOCIO_LABELS,
  TIPOS_SOCIO,
  sumaPorcentajes,
  capTableStatus,
  capTableStatusLabel,
} from '@/lib/gobierno/cap-table';

type EmpresaOption = { id: string; nombre: string };

type FormState = {
  nombre: string;
  familia: string;
  tipo: TipoSocio;
  porcentaje: string;
  socio_empresa_id: string;
  orden: string;
  activo: boolean;
  notas: string;
};

const EMPTY_FORM: FormState = {
  nombre: '',
  familia: '',
  tipo: 'entidad',
  porcentaje: '',
  socio_empresa_id: '',
  orden: '',
  activo: true,
  notas: '',
};

const STATUS_TONE: Record<CapTableStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  incompleto: 'warning',
  excedido: 'danger',
  vacio: 'neutral',
};

function toForm(s: Socio): FormState {
  return {
    nombre: s.nombre ?? '',
    familia: s.familia ?? '',
    tipo: s.tipo,
    porcentaje: s.porcentaje != null ? String(s.porcentaje) : '',
    socio_empresa_id: s.socio_empresa_id ?? '',
    orden: s.orden != null ? String(s.orden) : '',
    activo: s.activo,
    notas: s.notas ?? '',
  };
}

export function CuadroAccionarioPanel({ empresaId }: { empresaId: string }) {
  const supabase = createSupabaseBrowserClient();

  const [socios, setSocios] = useState<Socio[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Drawer alta/edición.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Socio | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSocios = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any -- supabase-js solo tipa public */
    const { data, error: err } = await (supabase.schema('core') as any)
      .from('empresa_socios')
      .select(
        'id, empresa_id, nombre, familia, tipo, socio_empresa_id, porcentaje, orden, activo, notas'
      )
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudieron cargar los socios.'));
      return;
    }
    setSocios((data ?? []) as Socio[]);
  }, [supabase, empresaId]);

  const fetchEmpresas = useCallback(async () => {
    const { data } = await supabase
      .schema('core')
      .from('empresas')
      .select('id, nombre')
      .eq('activa', true)
      .order('nombre', { ascending: true });
    setEmpresas((data ?? []) as EmpresaOption[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([fetchSocios(), fetchEmpresas()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchSocios, fetchEmpresas]);

  const suma = useMemo(() => sumaPorcentajes(socios), [socios]);
  const status = useMemo(() => capTableStatus(socios), [socios]);
  const empresaNombre = useMemo(() => {
    const m = new Map(empresas.map((e) => [e.id, e.nombre]));
    return (id: string | null) => (id ? (m.get(id) ?? '(empresa)') : null);
  }, [empresas]);

  const flashSaved = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, orden: String(socios.length + 1) });
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (s: Socio) => {
    setEditing(s);
    setForm(toForm(s));
    setFormError(null);
    setDrawerOpen(true);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    const nombre = form.nombre.trim();
    if (!nombre) {
      setFormError('El nombre del socio es obligatorio.');
      return;
    }
    const pct = Number(form.porcentaje);
    if (form.porcentaje.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      setFormError('El porcentaje debe ser un número entre 0 y 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      nombre,
      familia: form.familia.trim() || null,
      tipo: form.tipo,
      socio_empresa_id: form.socio_empresa_id || null,
      porcentaje: pct,
      orden: Number(form.orden) || 1,
      activo: form.activo,
      notas: form.notas.trim() || null,
    };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const table = (supabase.schema('core') as any).from('empresa_socios');
    const { error: err } = editing
      ? await table
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
      : await table.insert({ ...payload, empresa_id: empresaId });
    setSaving(false);
    if (err) {
      setFormError(getSupabaseErrorMessage(err, 'No se pudo guardar el socio.'));
      return;
    }
    setDrawerOpen(false);
    await fetchSocios();
    flashSaved();
  };

  const handleDelete = async (s: Socio) => {
    if (
      !confirm(
        `¿Eliminar al socio "${s.nombre}" del cuadro accionario?\n\nEsta acción no se puede deshacer.`
      )
    )
      return;
    setDeletingId(s.id);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { error: err } = await (supabase.schema('core') as any)
      .from('empresa_socios')
      .delete()
      .eq('id', s.id);
    setDeletingId(null);
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudo eliminar el socio.'));
      return;
    }
    await fetchSocios();
    flashSaved();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text)]/40" />
        <span className="text-sm text-[var(--text-muted)]">Cargando cuadro accionario…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--text)]/80">
            Socios
          </h4>
          {socios.length > 0 && (
            <Badge tone={STATUS_TONE[status]}>{capTableStatusLabel(status, suma)}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Guardado
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              void Promise.all([fetchSocios(), fetchEmpresas()]).finally(() => setLoading(false));
            }}
            className="gap-1.5 rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            Agregar socio
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400">
            ✕
          </button>
        </div>
      )}

      {socios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/20 p-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Sin socios capturados. Agrega los accionistas con su % de participación.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                {['Socio', 'Familia', 'Tipo', '%', 'Estado', ''].map((h, i) => (
                  <th
                    key={h || `acc-${i}`}
                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 ${
                      h === '%' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {socios.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--text)]">{s.nombre}</div>
                    {s.socio_empresa_id && (
                      <div className="mt-0.5">
                        <Badge tone="info">{empresaNombre(s.socio_empresa_id)} · BSOP</Badge>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]/70">{s.familia ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text)]/70">{TIPO_SOCIO_LABELS[s.tipo]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">
                    {Number(s.porcentaje).toFixed(s.porcentaje % 1 === 0 ? 0 : 2)}%
                  </td>
                  <td className="px-3 py-2">
                    {s.activo ? (
                      <Badge tone="success">Activo</Badge>
                    ) : (
                      <Badge tone="neutral">Inactivo</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(s)}
                        className="h-7 gap-1 px-2 text-xs"
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDelete(s)}
                        disabled={deletingId === s.id}
                        className="h-7 gap-1 px-2 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        title="Eliminar"
                      >
                        {deletingId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        El % no se fuerza a sumar 100 en la base (durante una reestructura puede no cuadrar); el
        badge de arriba avisa si la suma de socios activos difiere de 100%.
      </p>

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(v) => {
          if (!v && !saving) setDrawerOpen(false);
        }}
        size="sm"
        title={editing ? `Editar socio — ${editing.nombre}` : 'Agregar socio'}
        description="Accionista con su % de participación. Liga a una empresa BSOP si el socio también existe como empresa (p.ej. Nigropetense)."
      >
        <DetailDrawerContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <FieldLabel>Nombre del socio *</FieldLabel>
              <Input
                value={form.nombre}
                onChange={(e) => setField('nombre', e.target.value)}
                placeholder="Nigropetense Inmobiliaria S.A."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel>Familia</FieldLabel>
                <Input
                  value={form.familia}
                  onChange={(e) => setField('familia', e.target.value)}
                  placeholder="Santos de los Santos"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Tipo</FieldLabel>
                <select
                  value={form.tipo}
                  onChange={(e) => setField('tipo', e.target.value as TipoSocio)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
                >
                  {TIPOS_SOCIO.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_SOCIO_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel>% participación *</FieldLabel>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={form.porcentaje}
                  onChange={(e) => setField('porcentaje', e.target.value)}
                  placeholder="33.3333"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Orden</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={form.orden}
                  onChange={(e) => setField('orden', e.target.value)}
                  placeholder="1"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel>Liga a empresa BSOP (opcional)</FieldLabel>
              <select
                value={form.socio_empresa_id}
                onChange={(e) => setField('socio_empresa_id', e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
              >
                <option value="">— Ninguna (socio externo) —</option>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setField('activo', e.target.checked)}
                className="h-4 w-4"
              />
              Socio activo
            </label>
            <div className="space-y-1">
              <FieldLabel>Notas</FieldLabel>
              <textarea
                value={form.notas}
                onChange={(e) => setField('notas', e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {editing ? 'Guardar cambios' : 'Agregar socio'}
              </Button>
            </div>
          </div>
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}
