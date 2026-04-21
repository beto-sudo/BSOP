'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Carried from the original pages. Resetting the form on open is a
 * data-sync pattern flagged by the new hook rules; behavior-preserving
 * rewrite is out of scope for this PR.
 */

import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import type { DocForm, Documento, NotariaOption } from './types';
import { emptyForm } from './helpers';
import { DocFormFields } from './documento-form-fields';

export function DocumentoCreateSheet({
  open,
  onClose,
  notarias,
  onOpenCreateNotaria,
  primaryEmpresaId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
  primaryEmpresaId: string;
  onCreated: (doc: Documento) => void;
}) {
  const supabase = createSupabaseERPClient();
  const [form, setForm] = useState<DocForm>(emptyForm());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open]);

  const handleCreate = async () => {
    if (!form.titulo.trim() || !primaryEmpresaId) return;
    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: cu } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();
    const { data: newDoc, error: err } = await supabase
      .schema('erp')
      .from('documentos')
      .insert({
        empresa_id: primaryEmpresaId,
        titulo: form.titulo.trim(),
        numero_documento: form.numero_documento.trim() || null,
        tipo: form.tipo || null,
        fecha_emision: form.fecha_emision || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        notario_proveedor_id: form.notario_proveedor_id || null,
        notaria: form.notaria.trim() || null,
        descripcion: form.descripcion.trim() || null,
        notas: form.notas.trim() || null,
        subtipo_meta: Object.keys(form.subtipo_meta).length > 0 ? form.subtipo_meta : null,
        creado_por: cu?.id ?? null,
      })
      .select('*')
      .single();
    setCreating(false);
    if (err || !newDoc) {
      alert(`Error: ${err?.message ?? 'No se pudo crear'}`);
      return;
    }
    onClose();
    onCreated(newDoc as Documento);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>Nuevo Documento</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 pr-1">
          <div className="mt-4 pb-6">
            <DocFormFields
              form={form}
              setForm={setForm}
              notarias={notarias}
              onOpenCreateNotaria={onOpenCreateNotaria}
            />
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !form.titulo.trim() || !form.tipo}
                className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Guardar y adjuntar archivos
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
