'use client';

/**
 * AdjuntosSection — thin wrapper over the canonical `<FileAttachments>`
 * (file-attachments Sprint 2). Preserves the existing call-site API
 * (`documento-detail-sheet.tsx`) while delegating upload + delete +
 * preview behaviour to the shared component.
 *
 * The `adjuntos` and `onRefresh` props are kept for API compatibility but
 * are **ignored**: `<FileAttachments>` fetches its own state from
 * `erp.adjuntos`. When a future PR consolidates `documentos-module.tsx`
 * (which still bulk-fetches adjuntos to enrich the list view), this
 * component can drop the unused props entirely.
 */

import { FileAttachments } from '@/components/file-attachments';
import type { EmpresaSlug } from '@/lib/storage';

import type { Adjunto } from './types';

export function AdjuntosSection({
  documentoId,
  empresaId,
  empresaSlug = 'dilesa',
  onRefresh,
  readOnly,
}: {
  documentoId: string;
  empresaId: string;
  /** Slug de la empresa dueña del documento. Default `'dilesa'` (DILESA es el
   * único caller hoy; cuando otra empresa adopte documentos, el caller
   * pasa su slug). */
  empresaSlug?: EmpresaSlug;
  /** @deprecated `<FileAttachments>` re-fetcha; se mantiene por compat. */
  adjuntos?: Adjunto[];
  /** Llamado tras upload/delete para que el parent refresque la lista
   * (el chip de conteo en `documentos-module` depende de este bulk fetch). */
  onRefresh?: () => void;
  readOnly?: boolean;
}) {
  return (
    <FileAttachments
      empresaId={empresaId}
      empresaSlug={empresaSlug}
      entidad="documentos"
      entidadId={documentoId}
      roles={[
        { id: 'documento_principal', label: 'Documento principal (PDF)', icon: '📄' },
        { id: 'imagen_referencia', label: 'Imagen / Plano de referencia', icon: '🖼️' },
        { id: 'anexo', label: 'Anexos / Antecedentes', icon: '📎' },
      ]}
      defaultUploadRole="documento_principal"
      readOnly={readOnly}
      onChange={onRefresh}
    />
  );
}
