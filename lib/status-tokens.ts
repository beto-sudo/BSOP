/**
 * Shared status-badge token maps used by juntas, tasks, empleados, etc.
 *
 * Keeping these in one place avoids the drift we had when the same config
 * was copy-pasted across DILESA/RDB/Inicio listing and detail pages.
 * If you need a new status, add it here (not inline in a page).
 *
 * **Migración a tonos semánticos (badge-system, completado 2026-04-29)**:
 * cada config expone `tone: BadgeTone`. Los call-sites usan
 * `<Badge tone={cfg.tone}>{cfg.label}</Badge>`. El campo `cls` legacy
 * (paleta literal Tailwind) fue eliminado en Sprint 3 — todo el styling
 * vive ahora en `<Badge>` via `badgeVariants` (ver ADR-017).
 */

import type { BadgeTone } from '@/components/ui/badge';

export type JuntaEstado = 'programada' | 'en_curso' | 'completada' | 'cancelada';

export const JUNTA_ESTADO_CONFIG: Record<JuntaEstado, { label: string; tone: BadgeTone }> = {
  programada: { label: 'Programada', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'success' },
  completada: { label: 'Completada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
};
