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

// ────────────────────────────────────────────────────────────────────────────
// Dilesa — backbone inmobiliario (sprint dilesa-1 UI)
// ────────────────────────────────────────────────────────────────────────────

export type PrioridadNivel = 'alta' | 'media' | 'baja';

export const PRIORIDAD_CONFIG: Record<
  PrioridadNivel,
  { label: string; tone: BadgeTone; dot: string }
> = {
  alta: { label: 'Alta', tone: 'danger', dot: 'bg-red-500' },
  media: { label: 'Media', tone: 'warning', dot: 'bg-amber-500' },
  baja: { label: 'Baja', tone: 'success', dot: 'bg-emerald-500' },
};

/**
 * Estados del anteproyecto. Coinciden con el CHECK constraint en
 * `dilesa.anteproyectos.estado`.
 *  - `en_analisis`           (default al crear)
 *  - `en_tramite`
 *  - `en_due_diligence`
 *  - `pausado`
 *  - `no_viable`
 *  - `convertido_a_proyecto` (terminal; requiere proyecto_id NOT NULL)
 */
export type AnteproyectoEstado =
  | 'en_analisis'
  | 'en_tramite'
  | 'en_due_diligence'
  | 'pausado'
  | 'no_viable'
  | 'convertido_a_proyecto';

export const ANTEPROYECTO_ESTADO_CONFIG: Record<
  AnteproyectoEstado,
  { label: string; tone: BadgeTone }
> = {
  en_analisis: { label: 'En análisis', tone: 'neutral' },
  en_tramite: { label: 'En trámite', tone: 'info' },
  en_due_diligence: { label: 'Due diligence', tone: 'warning' },
  pausado: { label: 'Pausado', tone: 'warning' },
  no_viable: { label: 'No viable', tone: 'danger' },
  convertido_a_proyecto: { label: 'Convertido a proyecto', tone: 'success' },
};

/**
 * Opciones de `etapa` para Terrenos. Sin CHECK en DB — la UI las limita.
 * Ver /mnt/DILESA/knowledge/modules/terrenos-columnas-definitivas.md §E.
 */
export const TERRENO_ETAPA_OPTIONS = [
  'detectado',
  'en_revision',
  'en_analisis',
  'en_negociacion',
  'en_due_diligence',
  'aprobado_compra',
  'adquirido',
  'pausado',
  'descartado',
] as const;
export type TerrenoEtapa = (typeof TERRENO_ETAPA_OPTIONS)[number];

export const TERRENO_ETAPA_CONFIG: Record<TerrenoEtapa, { label: string; tone: BadgeTone }> = {
  detectado: { label: 'Detectado', tone: 'neutral' },
  en_revision: { label: 'En revisión', tone: 'info' },
  en_analisis: { label: 'En análisis', tone: 'info' },
  en_negociacion: { label: 'En negociación', tone: 'accent' },
  en_due_diligence: { label: 'Due diligence', tone: 'warning' },
  aprobado_compra: { label: 'Aprobado compra', tone: 'info' },
  adquirido: { label: 'Adquirido', tone: 'success' },
  pausado: { label: 'Pausado', tone: 'warning' },
  descartado: { label: 'Descartado', tone: 'danger' },
};

/**
 * Estatus de propiedad del terreno. UI-only (sin CHECK en DB).
 * Ver terrenos-columnas-definitivas.md fila #21.
 */
export const TERRENO_ESTATUS_PROPIEDAD_OPTIONS = [
  'ofrecido',
  'en_negociacion',
  'apartado_opcion',
  'adquirido',
  'descartado',
  'en_radar',
] as const;
export type TerrenoEstatusPropiedad = (typeof TERRENO_ESTATUS_PROPIEDAD_OPTIONS)[number];

export const TERRENO_ESTATUS_PROPIEDAD_LABEL: Record<TerrenoEstatusPropiedad, string> = {
  ofrecido: 'Ofrecido',
  en_negociacion: 'En negociación',
  apartado_opcion: 'Apartado / Opción',
  adquirido: 'Adquirido DILESA',
  descartado: 'Descartado',
  en_radar: 'En radar',
};

/**
 * Etapas del ciclo de vida de un prototipo (producto habitacional maestro).
 * Sin CHECK en DB — la UI las limita. El campo `etapa` en dilesa.prototipos
 * es text libre, igual que en terrenos.
 */
export const PROTOTIPO_ETAPA_OPTIONS = [
  'borrador',
  'en_diseno',
  'en_costeo',
  'aprobado',
  'activo',
  'pausado',
  'obsoleto',
] as const;
export type PrototipoEtapa = (typeof PROTOTIPO_ETAPA_OPTIONS)[number];

export const PROTOTIPO_ETAPA_CONFIG: Record<PrototipoEtapa, { label: string; tone: BadgeTone }> = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  en_diseno: { label: 'En diseño', tone: 'info' },
  en_costeo: { label: 'En costeo', tone: 'info' },
  aprobado: { label: 'Aprobado', tone: 'info' },
  activo: { label: 'Activo', tone: 'success' },
  pausado: { label: 'Pausado', tone: 'warning' },
  obsoleto: { label: 'Obsoleto', tone: 'danger' },
};

/**
 * Fases del ciclo de vida de un proyecto inmobiliario formalizado.
 * Sin CHECK en DB — la UI las limita. Se mueve en secuencia temporal:
 *   planeacion → urbanizacion → construccion → comercializacion → entrega → cerrado.
 * `pausado` queda fuera de la secuencia para casos de congelamiento. El valor
 * inicial al convertir desde anteproyecto es `planeacion` (ver endpoint
 * /api/dilesa/anteproyectos/[id]/convertir).
 */
export const PROYECTO_FASE_OPTIONS = [
  'planeacion',
  'urbanizacion',
  'construccion',
  'comercializacion',
  'entrega',
  'cerrado',
  'pausado',
] as const;
export type ProyectoFase = (typeof PROYECTO_FASE_OPTIONS)[number];

export const PROYECTO_FASE_CONFIG: Record<ProyectoFase, { label: string; tone: BadgeTone }> = {
  planeacion: { label: 'Planeación', tone: 'info' },
  urbanizacion: { label: 'Urbanización', tone: 'info' },
  construccion: { label: 'Construcción', tone: 'accent' },
  comercializacion: { label: 'Comercialización', tone: 'info' },
  entrega: { label: 'Entrega', tone: 'success' },
  cerrado: { label: 'Cerrado', tone: 'neutral' },
  pausado: { label: 'Pausado', tone: 'warning' },
};
