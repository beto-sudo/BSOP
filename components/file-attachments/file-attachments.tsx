'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * tus-js-client error shape and dynamic upload metadata cross untyped
 * JSON boundaries; consistent with the original uploaders.
 */

import * as React from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Combobox } from '@/components/ui/combobox';
import { getAdjuntoProxyUrl } from '@/lib/adjuntos';
import { formatBytes } from '@/lib/format';
import { buildAdjuntoPath } from '@/lib/storage';
import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { cn } from '@/lib/utils';

import { useAdjuntos } from './use-adjuntos';
import type { AdjuntoRow, FileAttachmentsProps, FileRole } from './types';

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.tiff';

/** Tus-resumable threshold inherited from the documentos uploader. */
const RESUMABLE_THRESHOLD = 5 * 1024 * 1024;

/**
 * `<FileAttachments>` — canonical attachments surface for any entity.
 *
 * Implements ADR-022 (file-attachments policy):
 * - FA1: bucket privado `adjuntos`; reads via `getAdjuntoProxyUrl()`.
 * - FA2: paths via `buildAdjuntoPath()`.
 * - FA3: `erp.adjuntos` insert/delete (paths only, no full URLs).
 * - FA4: roles canónicos por entidad (caller-defined via `roles` prop).
 * - FA5: delete via `<ConfirmDialog>` with hard delete (DB + storage).
 * - FA6: reads via `lib/adjuntos.ts`, never ad-hoc URLs.
 *
 * Internally fetches via `useAdjuntos()` so callers don't have to manage
 * adjunto state — they only configure the entity scope and the role list.
 */
export function FileAttachments({
  empresaId,
  empresaSlug,
  entidad,
  entidadId,
  roles,
  defaultUploadRole,
  multiple = true,
  accept = DEFAULT_ACCEPT,
  readOnly = false,
  variant = 'grouped',
  onChange,
}: FileAttachmentsProps) {
  // DB column is singular; storage path is plural. Strip trailing `s`.
  const entidadTipo = entidad.replace(/s$/, '');
  const { adjuntos, loading, refresh } = useAdjuntos({
    empresaId,
    entidadTipo,
    entidadId,
  });

  const [uploadRole, setUploadRole] = React.useState<string>(
    defaultUploadRole ?? roles[0]?.id ?? 'otro'
  );
  const [uploading, setUploading] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState<number | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<AdjuntoRow | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const notify = React.useCallback(async () => {
    await refresh();
    onChange?.();
  }, [refresh, onChange]);

  const uploadFiles = React.useCallback(
    async (files: File[]) => {
      if (!files.length || readOnly) return;
      setUploading(true);
      setUploadError(null);
      setUploadPct(0);
      const supabase = createSupabaseERPClient();
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const path = buildAdjuntoPath({
            empresa: empresaSlug,
            entidad,
            entidadId,
            filename: file.name,
          });
          if (file.size > RESUMABLE_THRESHOLD) {
            // Resumable uploads (>5MB). Lazy-import tus to avoid bloating
            // the client bundle for callers that never hit the threshold.
            const { uploadResumable } = await import('@/components/documentos/helpers');
            await uploadResumable(supabase as any, file, path, (pct) =>
              setUploadPct(Math.round(((i + pct / 100) / files.length) * 100))
            );
          } else {
            const { error } = await supabase.storage
              .from('adjuntos')
              .upload(path, file, { upsert: false });
            if (error) throw new Error(error.message);
            setUploadPct(Math.round(((i + 1) / files.length) * 100));
          }
          // Bucket is private — store ONLY the object path.
          const { error: insErr } = await supabase
            .schema('erp')
            .from('adjuntos')
            .insert({
              empresa_id: empresaId,
              entidad_tipo: entidadTipo,
              entidad_id: entidadId,
              nombre: file.name,
              url: path,
              tipo_mime: file.type || null,
              tamano_bytes: file.size,
              rol: uploadRole,
            });
          if (insErr) {
            // Roll back the storage object so we don't leave an orphan.
            await supabase.storage.from('adjuntos').remove([path]);
            throw new Error(insErr.message);
          }
        }
        await notify();
      } catch (err: any) {
        setUploadError(err?.message ?? 'Error al subir archivo');
      } finally {
        setUploading(false);
        setUploadPct(null);
      }
    },
    [empresaSlug, empresaId, entidad, entidadTipo, entidadId, readOnly, uploadRole, notify]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    void uploadFiles(files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (readOnly) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    void uploadFiles(files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!readOnly) setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    const supabase = createSupabaseERPClient();
    // Hard delete: DB row first, then storage object (FA5). If the second
    // call fails, the row is gone so we don't strand it; the storage
    // object becomes a non-listed orphan that GC can clean later.
    await supabase.schema('erp').from('adjuntos').delete().eq('id', pendingDelete.id);
    await supabase.storage.from('adjuntos').remove([pendingDelete.url]);
    setPendingDelete(null);
    await notify();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const byRol = React.useMemo(() => {
    const map = new Map<string, AdjuntoRow[]>();
    for (const a of adjuntos) {
      const arr = map.get(a.rol) ?? [];
      arr.push(a);
      map.set(a.rol, arr);
    }
    return map;
  }, [adjuntos]);

  const knownRoleIds = React.useMemo(() => new Set(roles.map((r) => r.id)), [roles]);
  const unknownRoles = React.useMemo(
    () =>
      Array.from(byRol.keys())
        .filter((r) => !knownRoleIds.has(r))
        .map((r): FileRole => ({ id: r, label: r })),
    [byRol, knownRoleIds]
  );
  const allRoles = React.useMemo(() => [...roles, ...unknownRoles], [roles, unknownRoles]);

  return (
    <div
      className={cn(
        'space-y-3',
        dragActive && !readOnly && 'rounded-2xl ring-2 ring-[var(--accent)] ring-offset-2'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {loading ? (
        <p className="text-xs text-[var(--text-subtle)]">Cargando archivos…</p>
      ) : adjuntos.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">Sin archivos.</p>
      ) : variant === 'grouped' ? (
        <div className="space-y-4">
          {allRoles.map((role) => {
            const items = byRol.get(role.id) ?? [];
            if (items.length === 0) return null;
            return (
              <RoleGroup
                key={role.id}
                role={role}
                items={items}
                readOnly={readOnly}
                onDelete={setPendingDelete}
              />
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden">
          {adjuntos.map((a) => (
            <FlatRow
              key={a.id}
              adjunto={a}
              role={allRoles.find((r) => r.id === a.rol)}
              readOnly={readOnly}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
          <Combobox
            value={uploadRole}
            onChange={(v) => setUploadRole(v || roles[0]?.id || 'otro')}
            options={roles.map((r) => ({
              value: r.id,
              label: typeof r.icon === 'string' ? `${r.icon} ${r.label}` : r.label,
            }))}
            size="sm"
            className="h-8 w-56 rounded-xl border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text)]"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--text)]/70 transition hover:bg-[var(--card)] hover:text-[var(--text)] disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-3 w-3" aria-hidden="true" />
            )}
            {uploading
              ? `Subiendo${uploadPct != null ? ` ${uploadPct}%` : '...'}`
              : 'Subir archivo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="sr-only"
            onChange={handleFileInput}
            disabled={uploading}
          />
          <span className="text-[10px] text-[var(--text-subtle)]">o arrastra archivos aquí</span>
          {uploadError && (
            <p role="alert" className="basis-full text-xs text-destructive">
              {uploadError}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="¿Eliminar este archivo?"
        description={pendingDelete ? `Se eliminará "${pendingDelete.nombre}".` : undefined}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleGroup({
  role,
  items,
  readOnly,
  onDelete,
}: {
  role: FileRole;
  items: AdjuntoRow[];
  readOnly: boolean;
  onDelete: (a: AdjuntoRow) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {role.icon ? (
          <span className="text-sm" aria-hidden="true">
            {role.icon}
          </span>
        ) : null}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
          {role.label}
        </span>
        <span className="text-[10px] text-[var(--text)]/30">({items.length})</span>
      </div>
      <ul className="space-y-1 pl-6">
        {items.map((a) => (
          <li key={a.id} className="group flex items-center gap-2">
            <AdjuntoLink adjunto={a} />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onDelete(a)}
                aria-label={`Eliminar ${a.nombre}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlatRow({
  adjunto,
  role,
  readOnly,
  onDelete,
}: {
  adjunto: AdjuntoRow;
  role: FileRole | undefined;
  readOnly: boolean;
  onDelete: (a: AdjuntoRow) => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--card)]/50 transition">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <AdjuntoLink adjunto={adjunto} />
        {role ? (
          <span className="text-[10px] uppercase tracking-wider text-[var(--text)]/40">
            {role.label}
          </span>
        ) : null}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => onDelete(adjunto)}
          aria-label={`Eliminar ${adjunto.nombre}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text)]/30 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function AdjuntoLink({ adjunto }: { adjunto: AdjuntoRow }) {
  const href = getAdjuntoProxyUrl(adjunto.url);
  const isImg =
    adjunto.tipo_mime?.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(adjunto.nombre);
  const isPdf =
    adjunto.tipo_mime === 'application/pdf' || adjunto.nombre.toLowerCase().endsWith('.pdf');
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs transition hover:bg-[var(--card)]',
        isPdf ? 'text-red-400' : isImg ? 'text-blue-400' : 'text-[var(--accent)]'
      )}
    >
      {isPdf ? (
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : isImg ? (
        <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{adjunto.nombre}</span>
      {adjunto.tamano_bytes != null && (
        <span className="shrink-0 text-[var(--text)]/30">{formatBytes(adjunto.tamano_bytes)}</span>
      )}
    </a>
  );
}
