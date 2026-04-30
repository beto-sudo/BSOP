'use client';

/**
 * Sección de contactos operativos de una persona.
 * Sub-componente del drawer de proveedor (RDB Sprint 2 de
 * `rdb-proveedores-data-completion`).
 *
 * Lee/escribe `erp.personas_contactos`. Multi-contacto, uno marcado
 * como principal (constraint partial unique en DB lo enforce).
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Star, X, Save, Trash2, RotateCcw, Pencil } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { PersonaContacto, PersonaContactoInsert } from '@/lib/personas/satellites';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

type Props = {
  personaId: string;
  empresaId: string;
};

type FormState = {
  nombre: string;
  puesto: string;
  telefono: string;
  email: string;
  notas: string;
  principal: boolean;
};

const EMPTY_FORM: FormState = {
  nombre: '',
  puesto: '',
  telefono: '',
  email: '',
  notas: '',
  principal: false,
};

export function PersonasContactosSection({ personaId, empresaId }: Props) {
  const [contactos, setContactos] = useState<PersonaContacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchContactos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('erp')
        .from('personas_contactos')
        .select('*')
        .eq('persona_id', personaId)
        .order('principal', { ascending: false })
        .order('activo', { ascending: false })
        .order('created_at', { ascending: true });
      if (err) throw err;
      setContactos((data ?? []) as PersonaContacto[]);
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con contactos'));
    } finally {
      setLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    void fetchContactos();
  }, [fetchContactos]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  const startEdit = (c: PersonaContacto) => {
    setEditingId(c.id);
    setForm({
      nombre: c.nombre,
      puesto: c.puesto ?? '',
      telefono: c.telefono ?? '',
      email: c.email ?? '',
      notas: c.notas ?? '',
      principal: c.principal,
    });
    setShowAdd(true);
  };

  const cancelForm = () => {
    setShowAdd(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();

      // Si se marca como principal, primero desmarcar el otro principal activo
      // (la partial unique de DB lo rechazaría si no).
      if (form.principal) {
        await supabase
          .schema('erp')
          .from('personas_contactos')
          .update({ principal: false })
          .eq('persona_id', personaId)
          .eq('principal', true)
          .eq('activo', true);
      }

      if (editingId) {
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_contactos')
          .update({
            nombre: form.nombre.trim(),
            puesto: form.puesto.trim() || null,
            telefono: form.telefono.trim() || null,
            email: form.email.trim() || null,
            notas: form.notas.trim() || null,
            principal: form.principal,
          })
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const insert: PersonaContactoInsert = {
          persona_id: personaId,
          empresa_id: empresaId,
          nombre: form.nombre.trim(),
          puesto: form.puesto.trim() || null,
          telefono: form.telefono.trim() || null,
          email: form.email.trim() || null,
          notas: form.notas.trim() || null,
          principal: form.principal,
        };
        const { error: err } = await supabase
          .schema('erp')
          .from('personas_contactos')
          .insert(insert);
        if (err) throw err;
      }

      cancelForm();
      await fetchContactos();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con contactos'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (c: PersonaContacto) => {
    setSaving(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Si se reactiva un principal, hay que desmarcar otros principales activos.
      const reactivatingPrincipal = !c.activo && c.principal;
      if (reactivatingPrincipal) {
        await supabase
          .schema('erp')
          .from('personas_contactos')
          .update({ principal: false })
          .eq('persona_id', personaId)
          .eq('principal', true)
          .eq('activo', true)
          .neq('id', c.id);
      }
      const { error: err } = await supabase
        .schema('erp')
        .from('personas_contactos')
        .update({ activo: !c.activo })
        .eq('id', c.id);
      if (err) throw err;
      await fetchContactos();
    } catch (e: unknown) {
      setError(getSupabaseErrorMessage(e, 'Error con contactos'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contactos
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
          {contactos.length === 0 && !showAdd && (
            <p className="text-xs text-muted-foreground">Sin contactos capturados</p>
          )}

          <ul className="space-y-2">
            {contactos.map((c) => (
              <li
                key={c.id}
                className={`rounded-md border p-2 text-sm ${c.activo ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{c.nombre}</span>
                      {c.principal && c.activo && (
                        <Badge variant="default" className="text-[10px]">
                          <Star className="mr-0.5 h-2.5 w-2.5" />
                          Principal
                        </Badge>
                      )}
                      {!c.activo && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    {c.puesto && <div className="text-xs text-muted-foreground">{c.puesto}</div>}
                    {(c.telefono || c.email) && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {c.telefono && <span className="font-mono">{c.telefono}</span>}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    )}
                    {c.notas && (
                      <div className="mt-0.5 text-xs italic text-muted-foreground">{c.notas}</div>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(c)}
                      disabled={saving}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActivo(c)}
                      disabled={saving}
                      aria-label={c.activo ? 'Inactivar' : 'Reactivar'}
                    >
                      {c.activo ? (
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
                {editingId ? 'Editar contacto' : 'Nuevo contacto'}
              </div>
              <Input
                placeholder="Nombre *"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              />
              <Input
                placeholder="Puesto / rol"
                value={form.puesto}
                onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Teléfono"
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <Input
                placeholder="Notas"
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.principal}
                  onChange={(e) => setForm((f) => ({ ...f, principal: e.target.checked }))}
                />
                Marcar como contacto principal
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
