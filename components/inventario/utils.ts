import { CLASIFICACION_INVENTARIO, type StockItem, type TipoUI } from './types';

export function mapTipoToDb(
  tipo: TipoUI,
  cantidad: number
): { tipoDB: string; cantidadSigned: number } {
  const abs = Math.abs(cantidad);
  switch (tipo) {
    case 'ajuste_positivo':
      return { tipoDB: 'ajuste', cantidadSigned: abs };
    case 'ajuste_negativo':
      return { tipoDB: 'ajuste', cantidadSigned: -abs };
    case 'merma':
      return { tipoDB: 'salida', cantidadSigned: -abs };
    case 'consumo_interno':
      return { tipoDB: 'salida', cantidadSigned: -abs };
  }
}

/**
 * @deprecated Use `formatCurrency` / `formatDateTime` from `@/lib/format`.
 */
export { formatCurrency } from '@/lib/format';
export { formatDateTime as formatDate } from '@/lib/format';

export function tipoLabel(tipo: string, cantidad: number): string {
  if (tipo === 'entrada') return 'Entrada';
  if (tipo === 'salida') return 'Salida';
  if (tipo === 'ajuste') return cantidad >= 0 ? 'Ajuste +' : 'Ajuste −';
  return tipo;
}

export function tipoColorClass(tipo: string, cantidad: number): string {
  const isPositive = tipo === 'entrada' || (tipo === 'ajuste' && cantidad >= 0);
  return isPositive
    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
    : 'border-red-500/40 text-red-600 dark:text-red-400';
}

export function computeStockStats(items: StockItem[]) {
  const valorables = items.filter((i) => CLASIFICACION_INVENTARIO.includes(i.clasificacion ?? ''));
  const bajosMinimo = valorables.filter((i) => i.bajo_minimo).length;
  const sinStock = valorables.filter((i) => i.stock_actual <= 0).length;
  // valor_inventario ya viene filtrado por clasificación desde SQL (vista
  // y RPC zerean consumibles + activo_fijo). Sumamos directo sobre todos
  // los items para que el KPI cuadre con CategoryFilterStrip y print —
  // los 3 deben mostrar la misma cifra (incluye items con stock negativo
  // como discrepancias de captura, no las clampeamos).
  const totalValue = items.reduce((acc, curr) => acc + (Number(curr.valor_inventario) || 0), 0);
  return { productos: valorables.length, bajosMinimo, sinStock, totalValue };
}
