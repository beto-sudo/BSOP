/**
 * KPIs reactivos a filtros para el hub Clientes (DILESA Ventas).
 * Anatomía ADR-034 (Module-level KPI strips).
 *
 * Pivote D12 vs curaduría Sprint 0 (ver planning doc): el KPI "%
 * con expediente completo" estaba marcado ⚠ porque requería definir
 * qué docs son "requeridos" — definición que no existe en el modelo
 * actual. Reinterpretado como "% contactables" (`email != null OR
 * telefono != null`) que es la única señal de "completitud" derivable
 * client-side hoy y dispara una decisión clara ("¿a quién no puedo
 * contactar?").
 *
 * Otros 4 KPIs siguen la curaduría:
 * - Total clientes — `rows.length`.
 * - # con venta activa — `count(numActivas > 0)`.
 * - # repetidores — `count(numVentas > 1)`.
 * - Compra promedio — `mean(montoTotal)` con `formatCurrency` compact.
 */

import type { ModuleKpi } from '@/components/module-page';
import { formatCurrency, formatPercent } from '@/lib/format';

export interface ClienteForKpis {
  numVentas: number;
  numActivas: number;
  montoTotal: number;
  email: string | null;
  telefono: string | null;
}

export function deriveClientesKpis(rows: readonly ClienteForKpis[]): readonly ModuleKpi[] {
  const total = rows.length;
  const conVentaActiva = rows.filter((c) => c.numActivas > 0).length;
  const repetidores = rows.filter((c) => c.numVentas > 1).length;
  const sumaMontos = rows.reduce((acc, c) => acc + (c.montoTotal ?? 0), 0);
  const compraPromedio = total === 0 ? null : sumaMontos / total;
  const contactables = rows.filter((c) => c.email != null || c.telefono != null).length;
  const pctContactables = total === 0 ? null : contactables / total;

  return [
    { key: 'total', label: 'Total clientes', value: total },
    { key: 'activos', label: 'Con venta activa', value: conVentaActiva },
    { key: 'repetidores', label: 'Repetidores', value: repetidores },
    {
      key: 'compra_promedio',
      label: 'Compra promedio',
      value: compraPromedio == null ? '—' : formatCurrency(compraPromedio, { compact: true }),
    },
    { key: 'contactables', label: '% contactables', value: formatPercent(pctContactables) },
  ];
}
