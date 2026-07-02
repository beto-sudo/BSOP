'use client';

import { ShoppingBag, Receipt, Banknote, CreditCard, Globe, CircleDollarSign } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Pedido } from './types';
import { formatCurrency } from './utils';
import { ventaCobrada } from './venta-cobrada';
import { sumarMontosPorTipo, TIPO_PAGO_LABELS, TIPOS_PAGO, type TipoPago } from './tipo-pago';

const TIPO_PAGO_ICONS: Record<TipoPago, LucideIcon> = {
  efectivo: Banknote,
  tarjeta: CreditCard,
  stripe: Globe,
  otro: CircleDollarSign,
};

export function SummaryBar({ pedidos }: { pedidos: Pedido[] }) {
  const total = pedidos.reduce((acc, p) => acc + ventaCobrada(p), 0);
  // Montos por método desde waitry_pagos: un pago dividido reparte su dinero
  // al bucket correcto. La suma de los métodos puede diferir ligeramente del
  // Total (venta cobrada) — propinas embebidas o pagos incompletos en Waitry.
  const porTipo = sumarMontosPorTipo(pedidos.map((p) => p.montos_pago));
  const tiposConMonto = TIPOS_PAGO.filter((t) => porTipo[t] > 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
      {tiposConMonto.map((tipo) => {
        const Icon = TIPO_PAGO_ICONS[tipo];
        return (
          <div key={tipo} className="rounded-xl border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {TIPO_PAGO_LABELS[tipo]}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatCurrency(porTipo[tipo])}
            </div>
          </div>
        );
      })}
    </div>
  );
}
