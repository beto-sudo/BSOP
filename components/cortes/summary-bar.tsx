import { Scissors, TrendingUp, Wallet } from 'lucide-react';
import { formatCurrency } from './helpers';
import type { Corte } from './types';

export function SummaryBar({ cortes }: { cortes: Corte[] }) {
  const totalInicial = cortes.reduce((s, c) => s + (c.efectivo_inicial ?? 0), 0);
  const totalContado = cortes.reduce((s, c) => s + (c.efectivo_contado ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Scissors className="h-3.5 w-3.5" />
          Cortes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{cortes.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Fondo Inicial
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalInicial)}
        </div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3 col-span-2 sm:col-span-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Efectivo Contado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCurrency(totalContado)}
        </div>
      </div>
    </div>
  );
}
