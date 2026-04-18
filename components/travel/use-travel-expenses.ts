'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { categories, type Expense, type ExpenseParticipantPreset, type Participant } from './types';
import { buildSettlement, hexToken, todayISO } from './utils';

export type UseTravelExpensesParams = {
  tripSlug: string;
  defaultCurrency: 'MXN' | 'USD';
  defaultExchangeRate: number;
  baseCurrency: 'MXN' | 'USD';
  participantPresets: ExpenseParticipantPreset[];
};

export function useTravelExpenses({
  tripSlug,
  defaultCurrency,
  defaultExchangeRate,
  baseCurrency,
  participantPresets,
}: UseTravelExpensesParams) {
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

    const [{ data: participantRows }, { data: expenseRows }, { data: tokenRows }] =
      await Promise.all([
        supabase
          .from('trip_participants')
          .select('id,name,emoji')
          .eq('trip_slug', tripSlug)
          .order('created_at'),
        supabase
          .from('trip_expenses')
          .select(
            'id,concept,category,amount,currency,exchange_rate,base_currency,base_amount,paid_by,notes,expense_date,expense_splits(participant_id)'
          )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripSlug]);

  const summary = useMemo(() => buildSettlement(participants, expenses), [participants, expenses]);
  const totalGeneral = useMemo(
    () => expenses.reduce((sum, expense) => sum + Number(expense.base_amount), 0),
    [expenses]
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
    if (!supabase || !expenseDraft.concept.trim() || !expenseDraft.amount || !expenseDraft.paidBy)
      return;

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

    if (
      expense?.id &&
      sharingParticipants.length &&
      sharingParticipants.length !== participants.length
    ) {
      await supabase.from('expense_splits').insert(
        sharingParticipants.map((participantId) => ({
          expense_id: expense.id,
          participant_id: participantId,
        }))
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
    const existing = await supabase
      .from('trip_share_tokens')
      .select('token')
      .eq('trip_slug', tripSlug)
      .maybeSingle();
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

  const paidByLabel = (id?: string | null) =>
    participants.find((participant) => participant.id === id)?.name ?? '—';
  const splitLabel = (expense: Expense) => {
    const splitIds = expense.expense_splits?.map((split) => split.participant_id) ?? [];
    if (!splitIds.length || splitIds.length === participants.length) return 'Todos';
    return participants
      .filter((participant) => splitIds.includes(participant.id))
      .map((participant) => participant.name)
      .join(', ');
  };

  return {
    supabase,
    participants,
    expenses,
    shareUrl,
    setShareUrl,
    loading,
    saving,
    copyState,
    setCopyState,
    participantDraft,
    setParticipantDraft,
    expenseDraft,
    setExpenseDraft,
    selectedParticipants,
    setSelectedParticipants,
    summary,
    totalGeneral,
    ensurePresetParticipants,
    addParticipant,
    addExpense,
    generateShareLink,
    paidByLabel,
    splitLabel,
  };
}
