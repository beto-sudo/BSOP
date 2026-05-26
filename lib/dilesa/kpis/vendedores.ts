/**
 * KPIs reactivos a filtros para el hub Vendedores (DILESA Ventas).
 * Anatomía ADR-034 (Module-level KPI strips).
 *
 * KPIs siguen la curaduría Sprint 0 sin pivotes — los datos derivados
 * por vendedor ya están en el row (`numVentas`, `numActivas`, `numCerradas`,
 * `montoTotal`) y el filtro de mes ya se aplica antes del agrupamiento.
 *
 * 1. Vendedores activos — `count(numVentas > 0)` en el dataset filtrado.
 * 2. Ventas en periodo — `SUM(numVentas)` cross-vendedores.
 * 3. $ vendido — `SUM(montoTotal)` con formatCurrency compact.
 * 4. Promedio ventas/vendedor — `total_ventas / activos` con 1 decimal.
 * 5. Top vendedor — `argmax(montoTotal)` formato "Nombre ($N.MM)".
 */

import type { ModuleKpi } from '@/components/module-page';
import { formatCurrency, formatNumber } from '@/lib/format';

export interface VendedorForKpis {
  nombre: string;
  numVentas: number;
  montoTotal: number;
}

export function deriveVendedoresKpis(rows: readonly VendedorForKpis[]): readonly ModuleKpi[] {
  const activos = rows.filter((v) => v.numVentas > 0).length;
  const totalVentas = rows.reduce((acc, v) => acc + v.numVentas, 0);
  const totalMonto = rows.reduce((acc, v) => acc + (v.montoTotal ?? 0), 0);
  const promedioVentas = activos === 0 ? null : totalVentas / activos;

  // Top vendedor por $ — tie-break alfabético estable (igual que tab Ventas).
  let topVendedor: VendedorForKpis | null = null;
  for (const v of [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
    if (topVendedor == null || v.montoTotal > topVendedor.montoTotal) {
      topVendedor = v;
    }
  }
  const topLabel =
    topVendedor == null || topVendedor.montoTotal === 0
      ? '—'
      : `${topVendedor.nombre} (${formatCurrency(topVendedor.montoTotal, { compact: true })})`;

  return [
    { key: 'activos', label: 'Vendedores activos', value: activos },
    { key: 'ventas_total', label: 'Ventas en periodo', value: totalVentas },
    {
      key: 'monto_total',
      label: '$ vendido',
      value: rows.length === 0 ? '—' : formatCurrency(totalMonto, { compact: true }),
    },
    {
      key: 'promedio',
      label: 'Promedio/vendedor',
      value: promedioVentas == null ? '—' : formatNumber(promedioVentas, { decimals: 1 }),
    },
    { key: 'top', label: 'Top vendedor', value: topLabel },
  ];
}
