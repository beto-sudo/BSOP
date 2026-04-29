/**
 * Shared status-badge token maps used by juntas, tasks, empleados, etc.
 *
 * Keeping these in one place avoids the drift we had when the same config
 * was copy-pasted across DILESA/RDB/Inicio listing and detail pages.
 * If you need a new status, add it here (not inline in a page).
 *
 * **Migración a tonos semánticos (badge-system Sprint 1, 2026-04-29)**:
 * cada config ahora expone `tone: BadgeTone` además del legacy `cls`.
 * Nuevos call-sites usan `<Badge tone={cfg.tone}>{cfg.label}</Badge>`.
 * `cls` queda deprecado y se eliminará cuando todos los callsites
 * migren (Sprint 2).
 */

import type { BadgeTone } from '@/components/ui/badge';

export type JuntaEstado = 'programada' | 'en_curso' | 'completada' | 'cancelada';

export const JUNTA_ESTADO_CONFIG: Record<
  JuntaEstado,
  { label: string; tone: BadgeTone; cls: string }
> = {
  programada: {
    label: 'Programada',
    tone: 'info',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  en_curso: {
    label: 'En curso',
    tone: 'success',
    cls: 'bg-green-500/15 text-green-400 border-green-500/20',
  },
  completada: {
    label: 'Completada',
    tone: 'neutral',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]',
  },
  cancelada: {
    label: 'Cancelada',
    tone: 'danger',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Dilesa — backbone inmobiliario (sprint dilesa-1 UI)
// ────────────────────────────────────────────────────────────────────────────

export type PrioridadNivel = 'alta' | 'media' | 'baja';

export const PRIORIDAD_CONFIG: Record<
  PrioridadNivel,
  { label: string; tone: BadgeTone; dot: string; cls: string }
> = {
  alta: {
    label: 'Alta',
    tone: 'danger',
    dot: 'bg-red-500',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
  media: {
    label: 'Media',
    tone: 'warning',
    dot: 'bg-amber-500',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  baja: {
    label: 'Baja',
    tone: 'success',
    dot: 'bg-emerald-500',
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
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
  { label: string; tone: BadgeTone; cls: string }
> = {
  en_analisis: {
    label: 'En análisis',
    tone: 'neutral',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/70 border-[var(--border)]',
  },
  en_tramite: {
    label: 'En trámite',
    tone: 'info',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  en_due_diligence: {
    label: 'Due diligence',
    tone: 'warning',
    cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  },
  pausado: {
    label: 'Pausado',
    tone: 'warning',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  no_viable: {
    label: 'No viable',
    tone: 'danger',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
  convertido_a_proyecto: {
    label: 'Convertido a proyecto',
    tone: 'success',
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
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

export const TERRENO_ETAPA_CONFIG: Record<
  TerrenoEtapa,
  { label: string; tone: BadgeTone; cls: string }
> = {
  detectado: {
    label: 'Detectado',
    tone: 'neutral',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/70 border-[var(--border)]',
  },
  en_revision: {
    label: 'En revisión',
    tone: 'info',
    cls: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  },
  en_analisis: {
    label: 'En análisis',
    tone: 'info',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  en_negociacion: {
    label: 'En negociación',
    tone: 'accent',
    cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  },
  en_due_diligence: {
    label: 'Due diligence',
    tone: 'warning',
    cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  },
  aprobado_compra: {
    label: 'Aprobado compra',
    tone: 'info',
    cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
  adquirido: {
    label: 'Adquirido',
    tone: 'success',
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  pausado: {
    label: 'Pausado',
    tone: 'warning',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  descartado: {
    label: 'Descartado',
    tone: 'danger',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
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

export const PROTOTIPO_ETAPA_CONFIG: Record<
  PrototipoEtapa,
  { label: string; tone: BadgeTone; cls: string }
> = {
  borrador: {
    label: 'Borrador',
    tone: 'neutral',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/70 border-[var(--border)]',
  },
  en_diseno: {
    label: 'En diseño',
    tone: 'info',
    cls: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  },
  en_costeo: {
    label: 'En costeo',
    tone: 'info',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  aprobado: {
    label: 'Aprobado',
    tone: 'info',
    cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
  activo: {
    label: 'Activo',
    tone: 'success',
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  pausado: {
    label: 'Pausado',
    tone: 'warning',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  obsoleto: {
    label: 'Obsoleto',
    tone: 'danger',
    cls: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
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

export const PROYECTO_FASE_CONFIG: Record<
  ProyectoFase,
  { label: string; tone: BadgeTone; cls: string }
> = {
  planeacion: {
    label: 'Planeación',
    tone: 'info',
    cls: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  },
  urbanizacion: {
    label: 'Urbanización',
    tone: 'info',
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  construccion: {
    label: 'Construcción',
    tone: 'accent',
    cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  },
  comercializacion: {
    label: 'Comercialización',
    tone: 'info',
    cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
  entrega: {
    label: 'Entrega',
    tone: 'success',
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  cerrado: {
    label: 'Cerrado',
    tone: 'neutral',
    cls: 'bg-[var(--border)]/60 text-[var(--text)]/50 border-[var(--border)]',
  },
  pausado: {
    label: 'Pausado',
    tone: 'warning',
    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
};
