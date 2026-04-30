'use client';

/**
 * Sección de direcciones operativas de una persona (proveedor).
 * Sub-componente del drawer (RDB Sprint 2 de `rdb-proveedores-data-completion`).
 *
 * Lee/escribe `erp.personas_direcciones`. El domicilio fiscal vive en
 * `erp.personas_datos_fiscales` (no se mezcla aquí). Multi-dirección, una principal.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Star, X, Save, Trash2, RotateCcw, Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  TIPO_DIRECCION,
  TIPO_DIRECCION_LABEL,
  formatDireccionLine,
  type PersonaDireccion,
  type PersonaDireccionInsert,
  type TipoDireccion,
} from '@/lib/personas/satellites';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Props = {
  personaId: string;
  empresaId: string;
};

type FormState = {
  tipo: TipoDireccion;
  calle: string;
  num_ext: string;
  num_int: string;
  colonia: string;
  cp: string;
  municipio: string;
  estado: string;
  pais: string;
  referencia: string;
  principal: boolean;
};

const EMPTY_FORM: FormState = {
  tipo: 'operativo',
  calle: '',
  num_ext: '',
  num_int: '',
  colonia: '',
  cp: '',
  municipio: '',
  estado: '',
  pais: 'México',
  referencia: '',
  principal: false,
};

export function PersonasDireccionesSection({ personaId, empresaId }: Props) {
  const [direcciones, setDirecciones] = useState<PersonaDireccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchDirecciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('erp')
        .from('personas_direcciones')
        .select('*')
        .eq('persona_id', personaId)
        .order('principal', { ascending: false })
        .order('activo', { ascending: false })
        .order('created_at', { ascending: true });
      if (err) throw err;
      setDirecciones((data ?? []) as PersonaDireccion[]);
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con direcciones'));
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    void fetchDirecciones();
  }, [fetchDirecciones]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  const startEdit = (d: PersonaDireccion) => {
    setEditingId(d.id);
    setForm({
      tipo: (d.tipo as TipoDireccion) ?? 'operativo',
      calle: d.calle ?? '',
      num_ext: d.num_ext ?? '',
      num_int: d.num_int ?? '',
      colonia: d.colonia ?? '',
      cp: d.cp ?? '',
      municipio: d.municipio ?? '',
      estado: d.estado ?? '',
      pais: d.pais,
      referencia: d.referencia ?? '',
      principal: d.principal,
    });
    setShowAdd(true);
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    // Al menos un campo de localización debe estar
    const hasContent =
      form.calle.trim() ||
      form.colonia.trim() ||
      form.cp.trim() ||
      form.municipio.trim() ||
      form.estado.trim();
    if (!hasContent) {
      setError('Captura al menos calle, colonia, CP, municipio o estado');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      if (form.principal) {
        await supabase
          .schema('erp')
          .from('personas_direcciones')
          .update({ principal: false })
          .eq('persona_id', personaId)
          .eq('principal', true)
          .eq('activo', true);
      }

      const payload = {
        tipo: form.tipo,
        calle: form.calle.trim() || null,
        num_ext: form.num_ext.trim() || null,
        num_int: form.num_int.trim() || null,
        colonia: form.colonia.trim() || null,
        cp: form.cp.trim() || null,
        municipio: form.municipio.trim() || null,
        estado: form.estado.trim() || null,
        pais: form.pais.trim() || 'México',
        referencia: form.referencia.trim() || null,
        principal: form.principal,
      };

      if (editingId) {
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_direcciones')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const insert: PersonaDireccionInsert = {
          ...payload,
          persona_id: personaId,
          empresa_id: empresaId,
        };
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_direcciones')
          .insert(insert);
        if (err) throw err;
      }

      cancelForm();
      await fetchDirecciones();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con direcciones'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (d: PersonaDireccion) => {
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const reactivatingPrincipal = !d.activo && d.principal;
      if (reactivatingPrincipal) {
        await supabase
          .schema('erp')
          .from('personas_direcciones')
          .update({ principal: false })
          .eq('persona_id', personaId)
          .eq('principal', true)
          .eq('activo', true)
          .neq('id', d.id);
      }
      const { error: err } = await supabase
        .schema('erp')
        .from('personas_direcciones')
        .update({ activo: !d.activo })
        .eq('id', d.id);
      if (err) throw err;
      await fetchDirecciones();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con direcciones'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Direcciones (operativas)
        </div>
        {!showAdd && (
          <Button variant="ghost" size="sm" onClick={startAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <>
          {direcciones.length === 0 && !showAdd && (
            <p className="text-xs text-muted-foreground">
              Sin direcciones operativas. El domicilio fiscal vive en CSF.
            </p>
          )}

          <ul className="space-y-2">
            {direcciones.map((d) => (
              <li
                key={d.id}
                className={`rounded-md border p-2 text-sm ${d.activo ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {TIPO_DIRECCION_LABEL[d.tipo as TipoDireccion] ?? d.tipo}
                      </Badge>
                      {d.principal && d.activo && (
                        <Badge variant="default" className="text-[10px]">
                          <Star className="mr-0.5 h-2.5 w-2.5" />
                          Principal
                        </Badge>
                      )}
                      {!d.activo && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs">{formatDireccionLine(d)}</div>
                    {d.referencia && (
                      <div className="mt-0.5 text-xs italic text-muted-foreground">
                        Ref: {d.referencia}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(d)}
                      disabled={saving}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActivo(d)}
                      disabled={saving}
                      aria-label={d.activo ? 'Inactivar' : 'Reactivar'}
                    >
                      {d.activo ? (
                        <Trash2 className="h-3.5 w-3.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {showAdd && (
            <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold">
                {editingId ? 'Editar dirección' : 'Nueva dirección'}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tipo
                </label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={form.tipo}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tipo: e.target.value as TipoDireccion }))
                  }
                >
                  {TIPO_DIRECCION.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_DIRECCION_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                placeholder="Calle"
                value={form.calle}
                onChange={(e) => setForm((f) => ({ ...f, calle: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Núm. ext."
                  value={form.num_ext}
                  onChange={(e) => setForm((f) => ({ ...f, num_ext: e.target.value }))}
                />
                <Input
                  placeholder="Núm. int."
                  value={form.num_int}
                  onChange={(e) => setForm((f) => ({ ...f, num_int: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Colonia"
                value={form.colonia}
                onChange={(e) => setForm((f) => ({ ...f, colonia: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="CP"
                  value={form.cp}
                  onChange={(e) => setForm((f) => ({ ...f, cp: e.target.value }))}
                />
                <Input
                  placeholder="Municipio"
                  value={form.municipio}
                  onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                />
                <Input
                  placeholder="Estado"
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                />
              </div>
              <Input
                placeholder="País"
                value={form.pais}
                onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))}
              />
              <Input
                placeholder="Referencia (entre calles, etc.)"
                value={form.referencia}
                onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
              />

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.principal}
                  onChange={(e) => setForm((f) => ({ ...f, principal: e.target.checked }))}
                />
                Marcar como dirección principal
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={cancelForm} disabled={saving}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
