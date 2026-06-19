/**
 * Contrato del patrón de reportes DILESA — «reporte = preset + vista + PDF»
 * (iniciativa dilesa-reportes, ADR-047).
 *
 * Un reporte se define como config en código (versionada): metadata para el
 * catálogo + dónde vive su vista + el sub-slug RBAC que gobierna su acceso.
 * El registry (`registry.ts`) los reúne; el hub-índice (`/dilesa/reportes`)
 * los lista filtrando por permisos, y cada módulo muestra los suyos.
 */
import type { LucideIcon } from 'lucide-react';

/** Módulo dueño de un reporte: su sub-slug RBAC + etiqueta legible. */
export type ReporteModulo = {
  /** Sub-slug RBAC que gobierna el acceso (ej. `dilesa.ventas.reportes`). */
  slug: string;
  /** Etiqueta del módulo para la tarjeta del catálogo (ej. `Ventas`). */
  label: string;
};

/** Un reporte vive dentro de un módulo o cruza varios. */
export type ReporteTipo = 'modulo' | 'cross-modulo';

/**
 * Definición de un reporte (el «preset»). Config en código, versionada.
 * Las «vistas guardadas» del usuario son una capa posterior (fase 2); esto
 * es el catálogo curado del sistema.
 */
export type ReporteDef = {
  /** Slug del reporte para la URL (ej. `pipeline-por-fase`). */
  id: string;
  nombre: string;
  descripcion: string;
  /** Módulo dueño — su sub-slug gobierna el acceso. */
  modulo: ReporteModulo;
  /** Ruta de la vista del reporte (deep-link desde el hub-índice). */
  href: string;
  /** Ícono para la tarjeta del catálogo. */
  icon: LucideIcon;
  tipo: ReporteTipo;
  /** ¿Expone exportación a PDF? */
  pdf: boolean;
};
