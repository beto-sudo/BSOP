'use client';

import { ShoppingBag, Receipt } from 'lucide-react';
import type { Pedido } from './types';
import { formatCurrency } from './utils';

export function SummaryBar({ pedidos }: { pedidos: Pedido[] }) {
  const total = pedidos.reduce((acc, p) => acc + (p.total_amount ?? 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" />
          Pedidos
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{pedidos.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(total)}</div>
      </div>
    </div>
  );
}
