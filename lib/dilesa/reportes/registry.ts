/**
 * Registry de reportes DILESA (config en código, versionada — ADR-047).
 *
 * El hub-índice (`/dilesa/reportes`) los lista TODOS filtrando por RBAC;
 * cada módulo muestra los suyos vía `reportesDeModulo`. Agregar un reporte =
 * una entrada aquí + su vista + (si aplica) su PDF y API route.
 *
 * v1 (iniciativa dilesa-reportes · Sprint 1): solo Ventas · Pipeline por fase.
 * Los demás reportes de Ventas (del planning) y de otros módulos se suman en
 * los siguientes sprints calcando este molde.
 */
import { CalendarRange, GitBranch, Trophy } from 'lucide-react';
import type { ReporteDef } from './tipos';

/** Sub-slug RBAC del tab «Reportes» de Ventas. */
export const MODULO_VENTAS_REPORTES = 'dilesa.ventas.reportes';
/** Slug del hub-índice global de reportes. */
export const MODULO_HUB_REPORTES = 'dilesa.reportes';

export const REPORTES: readonly ReporteDef[] = [
  {
    id: 'pipeline-por-fase',
    nombre: 'Pipeline por fase',
    descripcion:
      'Cuántas ventas y cuánto monto hay en cada una de las 17 fases del proceso. El embudo comercial, presentable y exportable.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/pipeline-por-fase',
    icon: GitBranch,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'ventas-periodo',
    nombre: 'Ventas del periodo',
    descripcion:
      'Ventas escrituradas en un rango de fechas, con desglose por mes y detalle por operación. El cierre comercial del periodo.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/ventas-periodo',
    icon: CalendarRange,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'productividad-vendedor',
    nombre: 'Productividad por vendedor',
    descripcion:
      'Scorecard por vendedor: cartera, pipeline en proceso, escrituradas, % de cierre y monto. Base para reconocimiento y comisiones.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/productividad-vendedor',
    icon: Trophy,
    tipo: 'modulo',
    pdf: true,
  },
];

/** Busca un reporte por su id. */
export function getReporte(id: string): ReporteDef | undefined {
  return REPORTES.find((r) => r.id === id);
}

/** Reportes que pertenecen a un módulo (por su sub-slug). */
export function reportesDeModulo(slug: string): readonly ReporteDef[] {
  return REPORTES.filter((r) => r.modulo.slug === slug);
}
