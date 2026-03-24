'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Calculator, Copy, Loader2, Plus, Share2, Users, Wallet } from 'lucide-react';
import { Surface } from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabase';

export type ExpenseParticipantPreset = { name: string; emoji?: string };

type Participant = {
  id: string;
  name: string;
  emoji?: string | null;
};

type Expense = {
  id: string;
  concept: string;
  category?: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  base_currency: string;
  base_amount: number;
  paid_by?: string | null;
  notes?: string | null;
  expense_date?: string | null;
  expense_splits?: { participant_id: string }[];
};

type Settlement = { from: string; to: string; amount: number };

const categories = ['Hospedaje', 'Comidas', 'Transporte', 'Entretenimiento', 'Estacionamiento', 'Otros'];

function money(value: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function hexToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildSettlement(participants: Participant[], expenses: Expense[]) {
  const balances = participants.map((participant) => {
    const totalPaid = expenses
      .filter((expense) => expense.paid_by === participant.id)
      .reduce((sum, expense) => sum + Number(expense.base_amount), 0);

    const fairShare = expenses.reduce((sum, expense) => {
      const splits = expense.expense_splits?.map((split) => split.participant_id) ?? [];
      const sharingIds = splits.length ? splits : participants.map((item) => item.id);
      if (!sharingIds.includes(participant.id)) return sum;
      return sum + Number(expense.base_amount) / sharingIds.length;
    }, 0);

    return {
      participant,
      totalPaid,
      fairShare,
      balance: totalPaid - fairShare,
    };
  });

  const creditors = balances
    .filter((item) => item.balance > 0.01)
    .map((item) => ({ ...item }))
    .sort((a, b) => b.balance - a.balance);
  const debtors = balances
    .filter((item) => item.balance < -0.01)
    .map((item) => ({ ...item, debt: Math.abs(item.balance) }))
    .sort((a, b) => b.debt - a.debt);

  const settlements: Settlement[] = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const creditor = creditors[c];
    const debtor = debtors[d];
    const amount = Math.min(creditor.balance, debtor.debt);

    settlements.push({
      from: debtor.participant.name,
      to: creditor.participant.name,
      amount,
    });

    creditor.balance -= amount;
    debtor.debt -= amount;

    if (creditor.balance <= 0.01) c += 1;
    if (debtor.debt <= 0.01) d += 1;
  }

  return { balances, settlements };
}

export function TravelExpenseTracker({
  tripSlug,
  tripName,
  defaultCurrency,
  defaultExchangeRate,
  baseCurrency = 'MXN',
  participantPresets = [],
  shareMode = false,
}: {
  tripSlug: string;
  tripName: string;
  defaultCurrency: 'MXN' | 'USD';
  defaultExchangeRate: number;
  baseCurrency?: 'MXN' | 'USD';
  participantPresets?: ExpenseParticipantPreset[];
  shareMode?: boolean;
}) {
  const supabase = getSupabaseClient();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState('');
  const [participantDraft, setParticipantDraft] = useState({ name: '', emoji: '' });
  const [expenseDraft, setExpenseDraft] = useState({
    concept: '',
    category: categories[0],
    amount: '',
    currency: defaultCurrency,
    exchangeRate: String(defaultCurrency === baseCurrency ? 1 : defaultExchangeRate),
    paidBy: '',
    expenseDate: todayISO(),
    notes: '',
  });
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

  async function loadData() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: participantRows }, { data: expenseRows }, { data: tokenRows }] = await Promise.all([
      supabase.from('trip_participants').select('id,name,emoji').eq('trip_slug', tripSlug).order('created_at'),
      supabase
        .from('trip_expenses')
        .select('id,concept,category,amount,currency,exchange_rate,base_currency,base_amount,paid_by,notes,expense_date,expense_splits(participant_id)')
        .eq('trip_slug', tripSlug)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('trip_share_tokens').select('token').eq('trip_slug', tripSlug).maybeSingle(),
    ]);

    const nextParticipants = (participantRows ?? []) as Participant[];
    setParticipants(nextParticipants);
    setExpenses((expenseRows ?? []) as Expense[]);
    if (tokenRows?.token && typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/compartir/${tokenRows.token}`);
    }
    setSelectedParticipants(nextParticipants.map((item) => item.id));
    setExpenseDraft((current) => ({ ...current, paidBy: nextParticipants[0]?.id ?? '' }));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [tripSlug]);

  const summary = useMemo(() => buildSettlement(participants, expenses), [participants, expenses]);
  const totalGeneral = useMemo(
    () => expenses.reduce((sum, expense) => sum + Number(expense.base_amount), 0),
    [expenses],
  );

  async function ensurePresetParticipants() {
    if (!supabase || participants.length || !participantPresets.length) return;
    const payload = participantPresets.map((participant) => ({
      trip_slug: tripSlug,
      name: participant.name,
      emoji: participant.emoji,
    }));
    await supabase.from('trip_participants').insert(payload);
    await loadData();
  }

  async function addParticipant(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !participantDraft.name.trim()) return;
    setSaving(true);
    await supabase.from('trip_participants').insert({
      trip_slug: tripSlug,
      name: participantDraft.name.trim(),
      emoji: participantDraft.emoji.trim() || null,
    });
    setParticipantDraft({ name: '', emoji: '' });
    setSaving(false);
    await loadData();
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !expenseDraft.concept.trim() || !expenseDraft.amount || !expenseDraft.paidBy) return;

    const amount = Number(expenseDraft.amount);
    const exchangeRate = Number(expenseDraft.exchangeRate) || 1;
    const baseAmount = expenseDraft.currency === baseCurrency ? amount : amount * exchangeRate;
    const sharingParticipants = selectedParticipants.length
      ? selectedParticipants
      : participants.map((participant) => participant.id);

    setSaving(true);
    const { data: expense } = await supabase
      .from('trip_expenses')
      .insert({
        trip_slug: tripSlug,
        concept: expenseDraft.concept.trim(),
        category: expenseDraft.category,
        amount,
        currency: expenseDraft.currency,
        exchange_rate: exchangeRate,
        base_currency: baseCurrency,
        base_amount: Number(baseAmount.toFixed(2)),
        paid_by: expenseDraft.paidBy,
        notes: expenseDraft.notes.trim() || null,
        expense_date: expenseDraft.expenseDate,
      })
      .select('id')
      .single();

    if (expense?.id && sharingParticipants.length && sharingParticipants.length !== participants.length) {
      await supabase.from('expense_splits').insert(
        sharingParticipants.map((participantId) => ({
          expense_id: expense.id,
          participant_id: participantId,
        })),
      );
    }

    setExpenseDraft({
      concept: '',
      category: categories[0],
      amount: '',
      currency: defaultCurrency,
      exchangeRate: String(defaultCurrency === baseCurrency ? 1 : defaultExchangeRate),
      paidBy: participants[0]?.id ?? '',
      expenseDate: todayISO(),
      notes: '',
    });
    setSelectedParticipants(participants.map((participant) => participant.id));
    setSaving(false);
    await loadData();
  }

  async function generateShareLink() {
    if (!supabase || typeof window === 'undefined') return;
    setSaving(true);
    const existing = await supabase.from('trip_share_tokens').select('token').eq('trip_slug', tripSlug).maybeSingle();
    const token = existing.data?.token ?? hexToken();

    if (!existing.data?.token) {
      await supabase.from('trip_share_tokens').upsert({ trip_slug: tripSlug, token });
    }

    const url = `${window.location.origin}/compartir/${token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setCopyState('Link copiado');
    setSaving(false);
  }

  const paidByLabel = (id?: string | null) => participants.find((participant) => participant.id === id)?.name ?? '—';
  const splitLabel = (expense: Expense) => {
    const splitIds = expense.expense_splits?.map((split) => split.participant_id) ?? [];
    if (!splitIds.length || splitIds.length === participants.length) return 'Todos';
    return participants
      .filter((participant) => splitIds.includes(participant.id))
      .map((participant) => participant.name)
      .join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-white"><Wallet className="h-4 w-4 text-amber-300" /> Resumen de gastos</div>
          <div className="mt-4 text-3xl font-semibold text-white">{money(totalGeneral, baseCurrency)}</div>
          <div className="mt-2 text-sm text-white/55">Total general del viaje en {baseCurrency}</div>
        </Surface>
        <Surface className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-white"><Calculator className="h-4 w-4 text-amber-300" /> Balance y liquidación</div>
              <div className="mt-1 text-sm text-white/55">Quién pagó de más y quién le debe a quién.</div>
            </div>
            {!shareMode ? (
              <button onClick={generateShareLink} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-amber-300/40 hover:text-amber-200">
                <Share2 className="h-4 w-4" /> Compartir viaje
              </button>
            ) : null}
          </div>
          {shareUrl ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              <div className="break-all">{shareUrl}</div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopyState('Link copiado');
                }}
                className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-100/90"
              >
                <Copy className="h-3.5 w-3.5" /> {copyState || 'Copiar link'}
              </button>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.balances.map((item) => (
              <div key={item.participant.id} className="rounded-2xl border border-white/8 bg-black/10 p-4">
                <div className="text-sm font-medium text-white">{item.participant.emoji ? `${item.participant.emoji} ` : ''}{item.participant.name}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-white/40">Pagó</div>
                <div className="mt-1 text-sm text-white/75">{money(item.totalPaid, baseCurrency)}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-white/40">Parte justa</div>
                <div className="mt-1 text-sm text-white/75">{money(item.fairShare, baseCurrency)}</div>
                <div className={item.balance >= 0 ? 'mt-3 text-sm font-semibold text-emerald-300' : 'mt-3 text-sm font-semibold text-rose-300'}>
                  Balance: {money(item.balance, baseCurrency)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm text-white/70">
            {summary.settlements.length ? summary.settlements.map((settlement) => (
              <div key={`${settlement.from}-${settlement.to}-${settlement.amount}`} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                <span className="font-medium text-white">{settlement.from}</span> le debe <span className="font-medium text-white">{money(settlement.amount, baseCurrency)}</span> a <span className="font-medium text-white">{settlement.to}</span>
              </div>
            )) : <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">Sin saldos pendientes por ahora.</div>}
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <Surface className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-white"><Users className="h-5 w-5 text-amber-300" /> <h3 className="text-lg font-semibold">Participantes</h3></div>
                <p className="mt-1 text-sm text-white/55">Base del reparto para {tripName}.</p>
              </div>
              {!participants.length && participantPresets.length ? (
                <button onClick={ensurePresetParticipants} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-amber-300/40 hover:text-white">Cargar base</button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {participants.map((participant) => (
                <div key={participant.id} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white/80">
                  {participant.emoji ? `${participant.emoji} ` : ''}{participant.name}
                </div>
              ))}
              {!participants.length && !loading ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">Todavía no hay participantes.</div> : null}
            </div>
            <form onSubmit={addParticipant} className="mt-5 grid gap-3">
              <input value={participantDraft.name} onChange={(e) => setParticipantDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Nombre" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
              <input value={participantDraft.emoji} onChange={(e) => setParticipantDraft((current) => ({ ...current, emoji: e.target.value }))} placeholder="Emoji opcional" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
              <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-medium text-black transition hover:bg-amber-200 disabled:opacity-60">
                <Plus className="h-4 w-4" /> Agregar participante
              </button>
            </form>
          </Surface>

          <Surface className="p-6">
            <div className="flex items-center gap-2 text-white"><Plus className="h-5 w-5 text-amber-300" /> <h3 className="text-lg font-semibold">Registrar gasto</h3></div>
            <form onSubmit={addExpense} className="mt-5 grid gap-3">
              <input value={expenseDraft.concept} onChange={(e) => setExpenseDraft((current) => ({ ...current, concept: e.target.value }))} placeholder="Concepto" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
              <select value={expenseDraft.category} onChange={(e) => setExpenseDraft((current) => ({ ...current, category: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
                {categories.map((category) => <option key={category} value={category} className="bg-slate-950">{category}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" step="0.01" value={expenseDraft.amount} onChange={(e) => setExpenseDraft((current) => ({ ...current, amount: e.target.value }))} placeholder="Monto" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                <select value={expenseDraft.currency} onChange={(e) => setExpenseDraft((current) => ({ ...current, currency: e.target.value as 'MXN' | 'USD', exchangeRate: e.target.value === baseCurrency ? '1' : String(defaultExchangeRate) }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
                  <option value="MXN" className="bg-slate-950">MXN</option>
                  <option value="USD" className="bg-slate-950">USD</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" step="0.0001" value={expenseDraft.exchangeRate} onChange={(e) => setExpenseDraft((current) => ({ ...current, exchangeRate: e.target.value }))} placeholder="Tipo de cambio" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                <select value={expenseDraft.paidBy} onChange={(e) => setExpenseDraft((current) => ({ ...current, paidBy: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none">
                  <option value="" className="bg-slate-950">Pagó</option>
                  {participants.map((participant) => <option key={participant.id} value={participant.id} className="bg-slate-950">{participant.name}</option>)}
                </select>
              </div>
              <input type="date" value={expenseDraft.expenseDate} onChange={(e) => setExpenseDraft((current) => ({ ...current, expenseDate: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none" />
              <textarea value={expenseDraft.notes} onChange={(e) => setExpenseDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Notas" rows={3} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
              <div className="rounded-2xl border border-white/8 bg-black/10 p-4">
                <div className="text-sm font-medium text-white">Participantes que comparten</div>
                <div className="mt-3 space-y-2">
                  {participants.map((participant) => {
                    const checked = selectedParticipants.includes(participant.id);
                    return (
                      <label key={participant.id} className="flex items-center gap-3 text-sm text-white/75">
                        <input type="checkbox" checked={checked} onChange={() => setSelectedParticipants((current) => checked ? current.filter((id) => id !== participant.id) : [...current, participant.id])} />
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
        </div>

        <Surface className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Lista de gastos</div>
              <div className="mt-1 text-sm text-white/55">Ordenados por fecha descendente.</div>
            </div>
          </div>
          {loading ? <div className="mt-6 text-sm text-white/50">Cargando gastos…</div> : null}
          {!supabase ? <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">Faltan variables de entorno de Supabase. Agrega `.env.local` y las variables en Vercel.</div> : null}
          <div className="mt-5 space-y-3">
            {expenses.map((expense) => (
              <div key={expense.id} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{expense.concept}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/40">{expense.category || 'Sin categoría'}</div>
                    <div className="mt-3 text-sm text-white/60">Pagó: {paidByLabel(expense.paid_by)}</div>
                    <div className="mt-1 text-sm text-white/60">Comparten: {splitLabel(expense)}</div>
                    {expense.notes ? <div className="mt-2 text-sm text-white/50">{expense.notes}</div> : null}
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-lg font-semibold text-white">{money(Number(expense.amount), expense.currency)}</div>
                    <div className="mt-1 text-sm text-amber-200">Base: {money(Number(expense.base_amount), expense.base_currency)}</div>
                    <div className="mt-1 text-xs text-white/45">{expense.expense_date || 'Sin fecha'} · TC {Number(expense.exchange_rate).toFixed(4)}</div>
                  </div>
                </div>
              </div>
            ))}
            {!expenses.length && !loading ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">Todavía no hay gastos registrados.</div> : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}
