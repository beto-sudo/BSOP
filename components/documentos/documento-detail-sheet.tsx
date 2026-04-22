'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import type { Adjunto, DocForm, Documento, NotariaOption } from './types';
import { META_LABELS } from './types';
import {
  docToForm,
  emptyForm,
  formatDate,
  formatMonto,
  formatPrecioM2,
  formatSuperficie,
} from './helpers';
import { FLabel, TipoBadge, TipoOperacionBadge, VencBadge } from './ui';
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
  onDocDeleted,
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
   * Callback para notificar al padre que el documento fue soft-deleted y
   * debería removerse de la lista en memoria. Solo aplica si el usuario
   * actual es admin y confirma la acción.
   */
  onDocDeleted?: (id: string) => void;
  /**
   * When set, the update query is also scoped by `empresa_id = scopedEmpresaId`
   * as defense-in-depth for per-empresa routes. Leave undefined for the
   * cross-empresa admin view (RLS does the filtering there).
   */
  scopedEmpresaId?: string;
}) {
  const supabase = createSupabaseERPClient();
  const { permissions } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<DocForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showContenido, setShowContenido] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

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
        descripcion: editForm.descripcion.trim() || null,
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
      descripcion: editForm.descripcion.trim() || null,
      notas: editForm.notas.trim() || null,
      subtipo_meta: Object.keys(editForm.subtipo_meta).length > 0 ? editForm.subtipo_meta : null,
    };
    onDocUpdated(updated);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!doc) return;
    setDeleting(true);
    let query = supabase
      .schema('erp')
      .from('documentos')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .is('deleted_at', null);
    if (scopedEmpresaId) query = query.eq('empresa_id', scopedEmpresaId);
    const { error: err } = await query;
    setDeleting(false);
    if (err) {
      alert(`Error al eliminar: ${err.message}`);
      return;
    }
    setConfirmingDelete(false);
    onDocDeleted?.(doc.id);
    onClose();
  };

  const handleExtract = async () => {
    if (!doc || extracting) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/documentos/${doc.id}/extract`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setExtractError(body?.error ?? `Error ${res.status}`);
        return;
      }
      if (body.documento) {
        onDocUpdated(body.documento as Documento);
      }
      // Los adjuntos pudieron renombrarse — refrescamos para ver el nombre
      // estándar en la sección de archivos.
      onRefreshAdjuntos();
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setExtracting(false);
    }
  };

  if (!doc) return null;

  const metaEntries = Object.entries(doc.subtipo_meta ?? {}).filter(([, v]) => v);
  const canExtract =
    !!doc.id &&
    (doc.extraccion_status === 'pendiente' ||
      doc.extraccion_status === 'error' ||
      !doc.extraccion_status);

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
            {!editing && canExtract && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtract}
                disabled={extracting}
                className="border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10"
                title="Extraer datos del PDF con IA (60-120s)"
              >
                {extracting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {extracting ? 'Procesando...' : 'Procesar con IA'}
              </Button>
            )}
            {!editing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                {permissions.isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingDelete(true)}
                    className="border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10"
                    title="Eliminar documento (solo admin)"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </Button>
                )}
              </>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-1 print:h-auto">
          <div className="mt-4 space-y-5 pb-6">
            {extractError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-0.5">Procesar con IA falló</p>
                  <p className="text-red-400/80">{extractError}</p>
                </div>
              </div>
            )}

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

                {/* ── Datos extraídos por IA ── */}
                {doc.extraccion_status === 'completado' && (
                  <>
                    <Separator />
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                        <h3 className="text-sm font-semibold text-[var(--text)]">
                          Datos extraídos
                        </h3>
                        {doc.extraccion_fecha && (
                          <span className="ml-auto text-[10px] text-[var(--text)]/40">
                            {formatDate(doc.extraccion_fecha.slice(0, 10))}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {doc.tipo_operacion && (
                          <div>
                            <FLabel>Operación</FLabel>
                            <TipoOperacionBadge tipo={doc.tipo_operacion} />
                          </div>
                        )}
                        {doc.monto != null && (
                          <div>
                            <FLabel>Monto</FLabel>
                            <p className="font-mono text-[var(--text)]/80">
                              {formatMonto(doc.monto, doc.moneda)}
                            </p>
                          </div>
                        )}
                        {doc.superficie_m2 != null && (
                          <div>
                            <FLabel>Superficie</FLabel>
                            <p className="text-[var(--text)]/80">
                              {formatSuperficie(doc.superficie_m2)}
                            </p>
                          </div>
                        )}
                        {doc.precio_m2 != null && (
                          <div>
                            <FLabel>Precio / m²</FLabel>
                            <p className="font-mono text-[var(--text)]/80">
                              {formatPrecioM2(doc.precio_m2, doc.moneda)}
                            </p>
                          </div>
                        )}
                        {(doc.municipio || doc.estado) && (
                          <div>
                            <FLabel>Ubicación</FLabel>
                            <p className="text-[var(--text)]/80">
                              {[doc.municipio, doc.estado].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        )}
                        {doc.folio_real && (
                          <div>
                            <FLabel>Folio real</FLabel>
                            <p className="text-[var(--text)]/80">{doc.folio_real}</p>
                          </div>
                        )}
                        {doc.libro_tomo && (
                          <div>
                            <FLabel>Libro / Tomo</FLabel>
                            <p className="text-[var(--text)]/80">{doc.libro_tomo}</p>
                          </div>
                        )}
                      </div>

                      {doc.ubicacion_predio && (
                        <div className="mt-3">
                          <FLabel>Ubicación del predio</FLabel>
                          <p className="text-sm text-[var(--text)]/70 whitespace-pre-wrap">
                            {doc.ubicacion_predio}
                          </p>
                        </div>
                      )}

                      {doc.partes && doc.partes.length > 0 && (
                        <div className="mt-4">
                          <FLabel>Partes involucradas</FLabel>
                          <ul className="space-y-2">
                            {doc.partes.map((p, i) => (
                              <li
                                key={i}
                                className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 p-2.5"
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-sm font-medium text-[var(--text)]">
                                    {p.nombre}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                                    {p.rol}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text)]/55">
                                  {p.rfc && <span>RFC: {p.rfc}</span>}
                                  {p.representante && <span>Rep: {p.representante}</span>}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {doc.contenido_texto && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => setShowContenido((v) => !v)}
                            className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)]/40 px-3 py-2 text-xs font-medium text-[var(--text)]/70 hover:bg-[var(--panel)]"
                          >
                            <span>
                              Contenido completo ·{' '}
                              {doc.contenido_texto.length.toLocaleString('es-MX')} chars
                            </span>
                            {showContenido ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          {showContenido && (
                            <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-3">
                              <p className="whitespace-pre-wrap font-mono text-xs text-[var(--text)]/75 leading-relaxed">
                                {doc.contenido_texto}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {doc.extraccion_status === 'error' && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium mb-0.5">Extracción IA falló</p>
                      <p className="text-red-400/80">
                        {doc.extraccion_error ?? 'Error desconocido'}
                      </p>
                    </div>
                  </div>
                )}

                {doc.descripcion && (
                  <>
                    <Separator />
                    <div>
                      <FLabel>Descripción</FLabel>
                      <p className="text-sm text-[var(--text)]/70 whitespace-pre-wrap">
                        {doc.descripcion}
                      </p>
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

      {/* Confirmación de borrado — solo alcanza aquí si el usuario es admin. */}
      <Dialog
        open={confirmingDelete}
        onOpenChange={(v) => {
          if (!v && !deleting) setConfirmingDelete(false);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl border-[var(--border)] bg-[var(--card)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-5 w-5" />
              Eliminar documento
            </DialogTitle>
            <DialogDescription className="text-[var(--text)]/60">
              Esta acción archivará el documento{' '}
              <span className="font-semibold text-[var(--text)]">«{doc.titulo}»</span>. Dejará de
              aparecer en el módulo, pero los archivos adjuntos, las partes y el texto extraído por
              IA se conservan en la base de datos y pueden restaurarse desde SQL si hiciera falta.
              ¿Continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-red-500 text-white hover:bg-red-500/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Sí, eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
