'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Carried from the original pages. The `setEditForm(docToForm(doc))` sync
 * on doc change is a data-sync pattern flagged by the new React hook rules;
 * rewriting changes render behavior and is out of scope for this PR.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Save } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import type { Adjunto, DocForm, Documento, NotariaOption } from './types';
import { META_LABELS } from './types';
import { docToForm, emptyForm, formatDate } from './helpers';
import { FLabel, TipoBadge, VencBadge } from './ui';
import { DocFormFields } from './documento-form-fields';
import { AdjuntosSection } from './documento-adjuntos';

export function DocumentoDetailSheet({
  doc,
  open,
  onClose,
  notarias,
  onOpenCreateNotaria,
  adjuntos,
  onRefreshAdjuntos,
  onDocUpdated,
  scopedEmpresaId,
}: {
  doc: Documento | null;
  open: boolean;
  onClose: () => void;
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
  adjuntos: Adjunto[];
  onRefreshAdjuntos: () => void;
  onDocUpdated: (d: Documento) => void;
  /**
   * When set, the update query is also scoped by `empresa_id = scopedEmpresaId`
   * as defense-in-depth for per-empresa routes. Leave undefined for the
   * cross-empresa admin view (RLS does the filtering there).
   */
  scopedEmpresaId?: string;
}) {
  const supabase = createSupabaseERPClient();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<DocForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) {
      setEditForm(docToForm(doc));
      setEditing(false);
    }
  }, [doc]);

  const handleSave = async () => {
    if (!doc || !editForm.titulo.trim()) return;
    setSaving(true);
    let query = supabase
      .schema('erp')
      .from('documentos')
      .update({
        titulo: editForm.titulo.trim(),
        numero_documento: editForm.numero_documento.trim() || null,
        tipo: editForm.tipo || null,
        fecha_emision: editForm.fecha_emision || null,
        fecha_vencimiento: editForm.fecha_vencimiento || null,
        notario_proveedor_id: editForm.notario_proveedor_id || null,
        notaria: editForm.notaria.trim() || null,
        notas: editForm.notas.trim() || null,
        subtipo_meta: Object.keys(editForm.subtipo_meta).length > 0 ? editForm.subtipo_meta : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);
    if (scopedEmpresaId) query = query.eq('empresa_id', scopedEmpresaId);
    const { error: err } = await query;
    setSaving(false);
    if (err) {
      alert(`Error: ${err.message}`);
      return;
    }
    const updated: Documento = {
      ...doc,
      titulo: editForm.titulo.trim(),
      numero_documento: editForm.numero_documento.trim() || null,
      tipo: editForm.tipo || null,
      fecha_emision: editForm.fecha_emision || null,
      fecha_vencimiento: editForm.fecha_vencimiento || null,
      notario_proveedor_id: editForm.notario_proveedor_id || null,
      notaria: editForm.notaria.trim() || null,
      notas: editForm.notas.trim() || null,
      subtipo_meta: Object.keys(editForm.subtipo_meta).length > 0 ? editForm.subtipo_meta : null,
    };
    onDocUpdated(updated);
    setEditing(false);
  };

  if (!doc) return null;

  const metaEntries = Object.entries(doc.subtipo_meta ?? {}).filter(([, v]) => v);

  const hasPrincipalPdf = adjuntos.some((a) => a.rol === 'documento_principal');
  const needsPdf = doc.tipo && doc.tipo !== 'Otro';

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>{editing ? 'Editar Documento' : doc.titulo}</SheetTitle>
          <div className="absolute right-12 top-4 hidden sm:flex gap-2 print:hidden">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-4 space-y-5 pb-6">
            {/* ── Info / Edit section ── */}
            {editing ? (
              <>
                <DocFormFields
                  form={editForm}
                  setForm={setEditForm}
                  notarias={notarias}
                  onOpenCreateNotaria={onOpenCreateNotaria}
                />
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditForm(docToForm(doc));
                      setEditing(false);
                    }}
                    className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !editForm.titulo.trim()}
                    className="rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={doc.tipo} />
                  <VencBadge d={doc.fecha_vencimiento} />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <FLabel>Número</FLabel>
                    <p className="text-[var(--text)]/80">{doc.numero_documento ?? '—'}</p>
                  </div>
                  <div>
                    <FLabel>Emisión</FLabel>
                    <p className="text-[var(--text)]/80">{formatDate(doc.fecha_emision)}</p>
                  </div>
                </div>
                {doc.notaria && (
                  <div>
                    <FLabel>Notaría</FLabel>
                    <p className="text-sm text-[var(--text)]/80">{doc.notaria}</p>
                  </div>
                )}

                {metaEntries.length > 0 && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {metaEntries.map(([k, v]) => (
                        <div key={k}>
                          <FLabel>{META_LABELS[k] ?? k}</FLabel>
                          <p className="text-[var(--text)]/80">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {doc.notas && (
                  <>
                    <Separator />
                    <div>
                      <FLabel>Notas</FLabel>
                      <p className="text-sm text-[var(--text)]/70 whitespace-pre-wrap">
                        {doc.notas}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Archivos section (always visible) ── */}
            <Separator />

            {needsPdf && !hasPrincipalPdf && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Este documento requiere un PDF escaneado como documento principal.
              </div>
            )}

            <AdjuntosSection
              documentoId={doc.id}
              empresaId={doc.empresa_id}
              adjuntos={adjuntos}
              onRefresh={onRefreshAdjuntos}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
