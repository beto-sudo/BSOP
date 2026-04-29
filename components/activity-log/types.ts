/**
 * Activity log primitives — see ADR-023 for the contract.
 *
 * `ActivityEvent` is the canonical shape that `<ActivityLog>` (Sprint 2)
 * will render. Adapters per backend (`erp.task_updates`, `erp.audit_log`,
 * `erp.movimientos_inventario`, etc.) map their rows to this shape.
 */

import type { BadgeTone } from '@/components/ui/badge';

/**
 * Canonical event types. Domain-specific events extend this with their own
 * literal strings (e.g. `'voucher_confirmed'`, `'oc_recibida'`); the
 * renderer falls back to `tone: 'neutral'` for unknown types.
 */
export type ActivityEventType =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'archived'
  | 'restored'
  | 'deleted'
  | 'comment'
  | (string & {}); // open for domain-specific extensions

export type ActivityActor = {
  id?: string | null;
  nombre: string;
  /** Optional avatar URL or initials. */
  avatar?: string | null;
};

export type ActivityFieldChange = {
  field: string;
  /** Pre-rendered label for the field (e.g. "Estado" instead of "estado"). */
  label?: string;
  before: string | number | null;
  after: string | number | null;
};

export type ActivityEvent = {
  id: string;
  /** ISO timestamp. */
  at: string;
  type: ActivityEventType;
  actor: ActivityActor | null;
  /** Optional descriptive copy ("Creó la tarea", "Cambió estado a En curso"). */
  summary?: string;
  /** Optional rich detail (free-form text from a comment, change description). */
  detail?: string | null;
  /** Field changes for `updated` / `status_changed` events. */
  changes?: ActivityFieldChange[];
};

/**
 * Token map for known event types: visual tone + label.
 * Adapters can extend by passing a custom `tones` map to the renderer.
 */
export const DEFAULT_ACTIVITY_TONES: Record<string, { label: string; tone: BadgeTone }> = {
  created: { label: 'Creado', tone: 'success' },
  updated: { label: 'Actualizado', tone: 'info' },
  status_changed: { label: 'Estado', tone: 'warning' },
  archived: { label: 'Archivado', tone: 'neutral' },
  restored: { label: 'Restaurado', tone: 'success' },
  deleted: { label: 'Eliminado', tone: 'danger' },
  comment: { label: 'Comentario', tone: 'neutral' },
};
