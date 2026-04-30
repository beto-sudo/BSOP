'use client';

import * as React from 'react';
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react';

import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.tiff';

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);
}

export type WizardFileSlotProps = {
  /** Stable role used by the caller to map the file to `erp.adjuntos.rol`. */
  role: string;
  label: React.ReactNode;
  /** When `true`, slot renders with required-field styling (red empty state, `*`). */
  required?: boolean;
  /** When `true` and `file == null`, slot renders as exempt (no upload button, muted). */
  exempt?: boolean;
  /** Tooltip / sub-label shown when `exempt` is true. */
  exemptHint?: React.ReactNode;
  /** Currently selected `File` from the caller's buffer, or `null` if not picked yet. */
  file: File | null;
  /**
   * Invoked when the user picks a file or removes one. The caller stores
   * the file in its own state map (e.g. `Record<role, File | null>`) and
   * uploads it during the wizard's `onSubmit` pipeline.
   */
  onChange: (file: File | null) => void;
  /** Disables interactions (e.g. while submitting). Default `false`. */
  disabled?: boolean;
  /** Mime/ext accept attribute. Default covers PDFs and common image formats. */
  accept?: string;
  className?: string;
};

/**
 * `<WizardFileSlot>` — deferred file picker for use inside `<WizardStep>`.
 *
 * Unlike `<FileAttachments>` (ADR-022), this slot does NOT upload to
 * Supabase storage on pick — the wizard's owning entity (e.g. `empleado`)
 * does not exist yet, so its `entidadId` is unknown. Instead, the slot
 * collects a `File` reference in the caller's in-memory state. The caller's
 * `onSubmit` pipeline uploads with `buildAdjuntoPath()` (FA2) once it has
 * inserted the entity row and obtained its id.
 *
 * Visual layout matches `<FileAttachments>` rows: 40px icon tile + label
 * + filename/size + remove/upload button.
 */
export function WizardFileSlot({
  role,
  label,
  required = false,
  exempt = false,
  exemptHint,
  file,
  onChange,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  className,
}: WizardFileSlotProps) {
  const inputId = React.useId();
  const handlePick = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0] ?? null;
      onChange(picked);
      // Allow re-picking the same file after remove.
      e.target.value = '';
    },
    [onChange]
  );

  const tileTone = file
    ? 'bg-green-500/10 text-green-400'
    : required && !exempt
      ? 'bg-red-500/10 text-red-400'
      : 'bg-[var(--card)] text-[var(--text-subtle)]';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2',
        className
      )}
      data-wizard-file-role={role}
    >
      <div
        className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tileTone)}
        aria-hidden="true"
      >
        {file && isImageFile(file) ? (
          <ImageIcon className="h-4 w-4" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text)] flex items-center gap-1">
          {label}
          {required && !exempt && (
            <span className="text-red-400" aria-hidden="true">
              *
            </span>
          )}
          {exempt && exemptHint && (
            <span className="text-[10px] text-[var(--text-subtle)]">{exemptHint}</span>
          )}
        </p>
        {file && (
          <p className="truncate text-xs text-[var(--text)]/60">
            {file.name} · {formatBytes(file.size)}
          </p>
        )}
      </div>

      {file ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="shrink-0 rounded-lg p-1.5 text-[var(--text)]/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          title="Quitar"
          aria-label={`Quitar archivo de ${role}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : exempt ? null : (
        <label htmlFor={inputId} className="cursor-pointer shrink-0">
          <input
            id={inputId}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handlePick}
            disabled={disabled}
          />
          <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] text-[var(--text)]/70 hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]">
            <Upload className="h-3 w-3" aria-hidden="true" />
            Subir
          </span>
        </label>
      )}
    </div>
  );
}
