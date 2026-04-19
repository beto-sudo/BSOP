'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Carried from the original pages: tus-js-client error shape and dynamic
 * metadata objects cross untyped JSON boundaries; tightening is out of
 * scope for this consolidation PR.
 */

/**
 * AdjuntosSection — private-bucket adjuntos for a given documento.
 *
 * Preserves the original signed-URL flow: uploads store only the object
 * path in erp.adjuntos.url, and the bulk fetch in documentos-module.tsx
 * enriches rows with short-lived signed URLs via lib/adjuntos.ts. Each
 * <a href={a.url}> here is rendered with a signed URL at list time, so
 * nothing to sign inline.
 */

import { useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Adjunto, AdjuntoRol } from './types';
import { RESUMABLE_THRESHOLD, fmtBytes, uploadResumable } from './helpers';

export function AdjuntosSection({
  documentoId,
  empresaId,
  adjuntos,
  onRefresh,
  readOnly,
}: {
  documentoId: string;
  empresaId: string;
  adjuntos: Adjunto[];
  onRefresh: () => void;
  readOnly?: boolean;
}) {
  const supabase = createSupabaseERPClient();
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadRole, setUploadRole] = useState<AdjuntoRol>('documento_principal');

  const principal = adjuntos.filter((a) => a.rol === 'documento_principal');
  const imagenes = adjuntos.filter((a) => a.rol === 'imagen_referencia');
  const anexos = adjuntos.filter((a) => a.rol === 'anexo');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setUploadPct(0);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `documentos/${empresaId}/${documentoId}/${Date.now()}-${i}.${ext}`;
      let err: string | null = null;
      try {
        if (file.size > RESUMABLE_THRESHOLD) {
          await uploadResumable(supabase, file, path, (pct) =>
            setUploadPct(Math.round(((i + pct / 100) / files.length) * 100))
          );
        } else {
          const { error } = await supabase.storage
            .from('adjuntos')
            .upload(path, file, { upsert: false });
          if (error) err = error.message;
          setUploadPct(Math.round(((i + 1) / files.length) * 100));
        }
      } catch (ex: any) {
        err = ex?.message ?? 'Error';
      }
      if (err) {
        alert(`Error: ${err}`);
        break;
      }
      // Bucket is private. Store ONLY the object path — UI generates short-lived
      // signed URLs on render (see lib/adjuntos.ts).
      const { data: cu } = await supabase
        .schema('core')
        .from('usuarios')
        .select('id')
        .eq('email', (await supabase.auth.getUser()).data.user?.email?.toLowerCase() ?? '')
        .maybeSingle();
      await supabase
        .schema('erp')
        .from('adjuntos')
        .insert({
          empresa_id: empresaId,
          entidad_tipo: 'documento',
          entidad_id: documentoId,
          uploaded_by: cu?.id ?? null,
          nombre: file.name,
          url: path,
          tipo_mime: file.type || null,
          tamano_bytes: file.size,
          rol: uploadRole,
        });
    }
    setUploading(false);
    setUploadPct(null);
    e.target.value = '';
    onRefresh();
  };

  const handleDelete = async (a: Adjunto) => {
    if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
    await supabase.schema('erp').from('adjuntos').delete().eq('id', a.id);
    onRefresh();
  };

  const renderGroup = (title: string, icon: React.ReactNode, items: Adjunto[]) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/50">
          {title}
        </span>
        <span className="text-[10px] text-[var(--text)]/30">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text)]/30 pl-6">Sin archivos</p>
      ) : (
        <ul className="space-y-1 pl-6">
          {items.map((a) => {
            const isImg =
              a.tipo_mime?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.nombre);
            const isPdf =
              a.tipo_mime === 'application/pdf' || a.nombre.toLowerCase().endsWith('.pdf');
            return (
              <li key={a.id} className="group flex items-center gap-2">
                {isImg && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <img
                      src={a.url}
                      alt={a.nombre}
                      className="h-10 w-10 rounded-lg border border-[var(--border)] object-cover"
                    />
                  </a>
                )}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs transition hover:bg-[var(--card)] ${isPdf ? 'text-red-400' : isImg ? 'text-blue-400' : 'text-[var(--accent)]'}`}
                >
                  {isPdf ? (
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                  ) : isImg ? (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Paperclip className="h-3 w-3 shrink-0" />
                  )}
                  <span className="min-w-0 truncate">{a.nombre}</span>
                  {a.tamano_bytes != null && (
                    <span className="shrink-0 text-[var(--text)]/30">
                      {fmtBytes(a.tamano_bytes)}
                    </span>
                  )}
                </a>
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(a)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {renderGroup(
        'Documento principal (PDF)',
        <FileText className="h-3.5 w-3.5 text-red-400" />,
        principal
      )}
      {renderGroup(
        'Imagen / Plano de referencia',
        <ImageIcon className="h-3.5 w-3.5 text-blue-400" />,
        imagenes
      )}
      {renderGroup(
        'Anexos / Antecedentes',
        <Paperclip className="h-3.5 w-3.5 text-[var(--text)]/40" />,
        anexos
      )}
      {!readOnly && (
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={uploadRole} onValueChange={(v) => setUploadRole(v as AdjuntoRol)}>
              <SelectTrigger className="w-52 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="documento_principal">📄 Documento principal</SelectItem>
                <SelectItem value="imagen_referencia">🖼️ Imagen / Plano</SelectItem>
                <SelectItem value="anexo">📎 Anexo</SelectItem>
              </SelectContent>
            </Select>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.tiff"
                multiple
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)] cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                {uploading
                  ? `Subiendo${uploadPct != null ? ` ${uploadPct}%` : '...'}`
                  : 'Subir archivo(s)'}
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
