'use client';

import type { FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Surface } from '@/components/ui';
import { categories, type Participant } from './types';

type ExpenseDraft = {
  concept: string;
  category: string;
  amount: string;
  currency: 'MXN' | 'USD';
  exchangeRate: string;
  paidBy: string;
  expenseDate: string;
  notes: string;
};

type ExpenseFormProps = {
  baseCurrency: 'MXN' | 'USD';
  defaultExchangeRate: number;
  participants: Participant[];
  saving: boolean;
  expenseDraft: ExpenseDraft;
  selectedParticipants: string[];
  onExpenseDraftChange: (updater: (current: ExpenseDraft) => ExpenseDraft) => void;
  onSelectedParticipantsChange: (updater: (current: string[]) => string[]) => void;
  onAddExpense: (e: FormEvent) => void;
};

export function ExpenseForm({
  baseCurrency,
  defaultExchangeRate,
  participants,
  saving,
  expenseDraft,
  selectedParticipants,
  onExpenseDraftChange,
  onSelectedParticipantsChange,
  onAddExpense,
}: ExpenseFormProps) {
  return (
    <Surface className="p-6">
      <div className="flex items-center gap-2 text-white"><Plus className="h-5 w-5 text-amber-300" /> <h3 className="text-lg font-semibold">Registrar gasto</h3></div>
      <form onSubmit={onAddExpense} className="mt-5 grid gap-3">
        <input value={expenseDraft.concept} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, concept: e.target.value }))} placeholder="Concepto" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        <select value={expenseDraft.category} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, category: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
          {categories.map((category) => <option key={category} value={category} className="bg-slate-950">{category}</option>)}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="number" step="0.01" value={expenseDraft.amount} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, amount: e.target.value }))} placeholder="Monto" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
          <select value={expenseDraft.currency} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, currency: e.target.value as 'MXN' | 'USD', exchangeRate: e.target.value === baseCurrency ? '1' : String(defaultExchangeRate) }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
            <option value="MXN" className="bg-slate-950">MXN</option>
            <option value="USD" className="bg-slate-950">USD</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="number" step="0.0001" value={expenseDraft.exchangeRate} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, exchangeRate: e.target.value }))} placeholder="Tipo de cambio" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
          <select value={expenseDraft.paidBy} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, paidBy: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
            <option value="" className="bg-slate-950">Pagó</option>
            {participants.map((participant) => <option key={participant.id} value={participant.id} className="bg-slate-950">{participant.name}</option>)}
          </select>
        </div>
        <input type="date" value={expenseDraft.expenseDate} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, expenseDate: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none" />
        <textarea value={expenseDraft.notes} onChange={(e) => onExpenseDraftChange((current) => ({ ...current, notes: e.target.value }))} placeholder="Notas" rows={3} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
          <div className="text-sm font-medium text-white">Participantes que comparten</div>
          <div className="mt-3 space-y-2">
            {participants.map((participant) => {
              const checked = selectedParticipants.includes(participant.id);
              return (
                <label key={participant.id} className="flex items-center gap-3 text-sm text-white/75">
                  <input type="checkbox" checked={checked} onChange={() => onSelectedParticipantsChange((current) => checked ? current.filter((id) => id !== participant.id) : [...current, participant.id])} />
                  <span>{participant.name}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-white/45">Si están todos seleccionados, se reparte entre todos.</div>
        </div>
        <button disabled={saving || !participants.length} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-medium text-black transition hover:bg-amber-200 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Guardar gasto
        </button>
      </form>
    </Surface>
  );
}
