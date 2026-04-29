import type { ReactNode } from 'react';

import type { AdjuntoEntidad, EmpresaSlug } from '@/lib/storage';

/**
 * Role displayed as a section heading inside `<FileAttachments>`. Matches
 * one canonical `rol` value in `erp.adjuntos`.
 *
 * Convention (ADR-022 FA4): each entidad declares its own role list. Examples:
 * - documentos: `documento_principal` | `imagen_referencia` | `anexo`.
 * - empleados: `foto` | `ine` | `curp` | ... | `otro`.
 */
export type FileRole = {
  id: string;
  label: string;
  /** Optional emoji or `<Icon />` rendered next to the label. */
  icon?: ReactNode;
};

/** Row from `erp.adjuntos` (subset used by the component). */
export type AdjuntoRow = {
  id: string;
  empresa_id: string;
  entidad_tipo: string;
  entidad_id: string;
  rol: string;
  url: string;
  nombre: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
  created_at: string;
};

export type FileAttachmentsProps = {
  /** Empresa UUID (for `erp.adjuntos.empresa_id`). */
  empresaId: string;
  /** Empresa slug for the canonical storage path (FA2). */
  empresaSlug: EmpresaSlug;
  /**
   * Plural entidad name used in the storage path AND from which
   * `entidad_tipo` (DB column, singular) is derived by stripping `'s'`.
   * E.g. `'documentos'` → DB writes `entidad_tipo='documento'`.
   */
  entidad: AdjuntoEntidad;
  /** Parent row id (e.g. documento.id, empleado.id). */
  entidadId: string;
  /** Roles available — each becomes a section in the rendered list. */
  roles: FileRole[];
  /** Default role for the upload picker. Defaults to `roles[0].id`. */
  defaultUploadRole?: string;
  /** Permitir múltiples archivos por upload. Default `true`. */
  multiple?: boolean;
  /**
   * Mime/ext accept attribute. Default covers PDFs and common image formats:
   * `'.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.tiff'`.
   */
  accept?: string;
  /** Read-only mode (no upload, no delete). Default `false`. */
  readOnly?: boolean;
  /**
   * `'grouped'` (default) — sections per role with role labels visible.
   * `'flat'` — single list, role shown as inline meta on each row.
   */
  variant?: 'grouped' | 'flat';
  /**
   * Optional callback invoked after a successful upload or delete. Use to
   * notify parent state (refresh row counts, recompute derived data).
   */
  onChange?: () => void;
};
