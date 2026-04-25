'use client';

import { useMemo } from 'react';

const CAT_ORDER = [
  'Alimentos',
  'Bebidas',
  'Licores',
  'Artículos',
  'Deportes',
  'Consumibles',
  'Propinas',
] as const;

export interface CategoryFilterItem {
  categoria: string | null;
  valor_inventario: number | null;
}

export interface CategoryFilterStripProps {
  items: ReadonlyArray<CategoryFilterItem>;
  activeCategory: string;
  onSelect: (next: string) => void;
}

/**
 * Per ADR-004 R6/R7: dimensional breakdowns (categoría, segmento) are filters,
 * not KPIs. They live in their own component below the filter bar — never inside
 * <ModuleKpiStrip>.
 *
 * Click on a card toggles that category as the active filter; clicking the
 * already-active card clears it.
 */
export function CategoryFilterStrip({ items, activeCategory, onSelect }: CategoryFilterStripProps) {
  const sorted = useMemo(() => {
    type CatStat = { count: number; valor: number };
    const stats: Record<string, CatStat> = {};
    for (const c of CAT_ORDER) stats[c] = { count: 0, valor: 0 };
    for (const item of items) {
      const c = item.categoria ?? 'Otros';
      if (!stats[c]) stats[c] = { count: 0, valor: 0 };
      stats[c].count++;
      stats[c].valor += Number(item.valor_inventario) || 0;
    }
    return Object.entries(stats)
      .filter(([, s]) => s.count > 0)
      .sort((a, b) => b[1].valor - a[1].valor);
  }, [items]);

  if (sorted.length === 0) return null;

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {sorted.map(([cat, s]) => {
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelect(active ? '' : cat)}
            className={[
              'rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60',
              active ? 'border-primary bg-primary/10' : 'bg-card',
            ].join(' ')}
          >
            <div className="text-xs font-medium text-muted-foreground truncate">{cat}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">
              {new Intl.NumberFormat('es-MX', {
                style: 'currency',
                currency: 'MXN',
                maximumFractionDigits: 0,
              }).format(s.valor)}
            </div>
            <div className="text-xs text-muted-foreground">{s.count} prod.</div>
          </button>
        );
      })}
    </div>
  );
}
