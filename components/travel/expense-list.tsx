'use client';

import { Surface } from '@/components/ui/surface';
import type { Expense } from './types';
import { money } from './utils';

type ExpenseListProps = {
  expenses: Expense[];
  loading: boolean;
  hasSupabase: boolean;
  paidByLabel: (id?: string | null) => string;
  splitLabel: (expense: Expense) => string;
};

export function ExpenseList({
  expenses,
  loading,
  hasSupabase,
  paidByLabel,
  splitLabel,
}: ExpenseListProps) {
  return (
    <Surface className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">Lista de gastos</div>
          <div className="mt-1 text-sm text-white/55">Ordenados por fecha descendente.</div>
        </div>
      </div>
      {loading ? <div className="mt-6 text-sm text-white/50">Cargando gastos…</div> : null}
      {!hasSupabase ? (
        <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
          Faltan variables de entorno de Supabase. Agrega `.env.local` y las variables en Vercel.
        </div>
      ) : null}
      <div className="mt-5 space-y-3">
        {expenses.map((expense) => (
          <div key={expense.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium text-white">{expense.concept}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/40">
                  {expense.category || 'Sin categoría'}
                </div>
                <div className="mt-3 text-sm text-white/60">
                  Pagó: {paidByLabel(expense.paid_by)}
                </div>
                <div className="mt-1 text-sm text-white/60">Comparten: {splitLabel(expense)}</div>
                {expense.notes ? (
                  <div className="mt-2 text-sm text-white/50">{expense.notes}</div>
                ) : null}
              </div>
              <div className="text-left sm:text-right">
                <div className="text-lg font-semibold text-white">
                  {money(Number(expense.amount), expense.currency)}
                </div>
                <div className="mt-1 text-sm text-amber-200">
                  Base: {money(Number(expense.base_amount), expense.base_currency)}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  {expense.expense_date || 'Sin fecha'} · TC{' '}
                  {Number(expense.exchange_rate).toFixed(4)}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!expenses.length && !loading ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">
            Todavía no hay gastos registrados.
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
