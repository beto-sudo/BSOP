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

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
}

export function formatDate(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    timeZone: 'America/Matamoros',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

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
  const totalValue = valorables.reduce((acc, curr) => acc + (curr.valor_inventario || 0), 0);
  return { productos: valorables.length, bajosMinimo, sinStock, totalValue };
}
