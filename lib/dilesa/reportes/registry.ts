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
import {
  Banknote,
  Boxes,
  CalendarClock,
  CalendarRange,
  Clock,
  CreditCard,
  Gauge,
  GitBranch,
  Layers,
  Stamp,
  Trophy,
  UserMinus,
} from 'lucide-react';
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
    id: 'depositos-periodo',
    nombre: 'Depósitos del periodo',
    descripcion:
      'Depósitos recibidos en el periodo (cobranza de ventas) con desglose por mes y por origen: liberación de crédito de institución (la detonación) vs abono directo del cliente. Abre en el mes corriente. El insumo del cierre contable, exportable a PDF y CSV.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/depositos-periodo',
    icon: Banknote,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'ventas-por-fase',
    nombre: 'Ventas por fase',
    descripcion:
      'Cuántas ventas registraron una fase del proceso en un periodo, por la fecha en que se registró la terminación de la fase. Elegí la fase (las 17) y el rango: 17 reportes en uno. Abre en Detonada del mes corriente. Exportable a PDF y CSV.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/ventas-por-fase',
    icon: Layers,
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
  {
    id: 'escrituracion-programada',
    nombre: 'Escrituración programada',
    descripcion:
      'La agenda de firmas (fase 10) con su estado (pendiente / escriturada), por fecha. El calendario del cierre notarial.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/escrituracion-programada',
    icon: CalendarClock,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'por-tipo-credito',
    nombre: 'Por tipo de crédito',
    descripcion:
      'Distribución de la cartera por tipo de crédito (INFONAVIT / FOVISSSTE / bancario / contado): conteo, monto y participación.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/por-tipo-credito',
    icon: CreditCard,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'inventario-disponible',
    nombre: 'Inventario disponible',
    descripcion:
      'Unidades vendibles hoy (en construcción o terminadas) agrupadas por proyecto y prototipo. Qué hay para ofrecer y dónde.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/inventario-disponible',
    icon: Boxes,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'desasignadas',
    nombre: 'Ventas desasignadas',
    descripcion:
      'Ventas que se dieron de baja, con su motivo, separadas en reubicaciones (el cliente se mueve a otra unidad) y bajas reales.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/desasignadas',
    icon: UserMinus,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'estancadas',
    nombre: 'Ventas estancadas',
    descripcion:
      'El pipeline vivo ordenado por antigüedad en la fase actual: las que llevan más tiempo sin avanzar quedan arriba. Alerta temprana.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/estancadas',
    icon: Clock,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'unidades-escriturables',
    nombre: 'Unidades escriturables',
    descripcion:
      'Qué se puede firmar ya: unidades con obra terminada y extracción del RUV capturada, en inventario o asignadas sin escriturar. Incluye qué detiene al resto (falta extracción vs obra en proceso).',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/unidades-escriturables',
    icon: Stamp,
    tipo: 'modulo',
    pdf: true,
  },
  {
    id: 'calificacion-por-fase',
    nombre: 'Calificación por fase',
    descripcion:
      'Qué tan rápido avanza cada fase del pipeline: mediana y p90 de días, contra su histórico, con banda y tendencia. Dónde se atora el proceso, filtrable por periodo.',
    modulo: { slug: MODULO_VENTAS_REPORTES, label: 'Ventas' },
    href: '/dilesa/ventas/reportes/calificacion-por-fase',
    icon: Gauge,
    tipo: 'modulo',
    pdf: false,
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
