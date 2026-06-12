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

/**
 * Estados de `dilesa.ventas.estado` (constraint `ventas_estado_check`).
 * `estado` = ciclo de vida del registro; el avance vive en `fase_actual`/
 * `fase_posicion` (pipeline de 17 fases). 'terminada' la setea el trigger
 * `trg_ventas_sync_estado_terminada` cuando la venta alcanza la fase 17.
 */
export type VentaEstado = 'activa' | 'terminada' | 'desasignada' | 'expirada';

export const VENTA_ESTADO_CONFIG: Record<VentaEstado, { label: string; tone: BadgeTone }> = {
  activa: { label: 'Activa', tone: 'info' },
  terminada: { label: 'Terminada', tone: 'success' },
  desasignada: { label: 'Desasignada', tone: 'neutral' },
  expirada: { label: 'Expirada', tone: 'warning' },
};

/** Orden canónico para dropdowns de filtro. */
export const VENTA_ESTADOS: readonly VentaEstado[] = [
  'activa',
  'terminada',
  'desasignada',
  'expirada',
];

export type JuntaEstado = 'programada' | 'en_curso' | 'completada' | 'cancelada';

export const JUNTA_ESTADO_CONFIG: Record<JuntaEstado, { label: string; tone: BadgeTone }> = {
  programada: { label: 'Programada', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'success' },
  completada: { label: 'Completada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
};
