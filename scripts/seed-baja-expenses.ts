import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TRIP_SLUG = 'baja-etapa-1';
const TSV_PATH = '/Users/Beto/.openclaw/workspace/travel/2026-02-baja-etapa-1/04-bookings/gastos.tsv';
const ENV_PATH = path.join(process.cwd(), '.env.local');

function loadEnvFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseNumber(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  return Number.parseFloat(normalized || '0');
}

function escapeSql(value: string) {
  return value.replace(/'/g, "''");
}

type RawExpense = {
  expense_date: string;
  category: string;
  concept: string;
  amount: number;
  currency: 'MXN' | 'USD';
  exchange_rate: number;
  base_currency: 'MXN';
  base_amount: number;
  payer_name: 'Beto' | 'Memo' | 'Cuate';
  notes: string | null;
  participants: string[];
};

function parseTsv(tsv: string): RawExpense[] {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const [, ...rows] = lines;

  return rows.map((line) => {
    const [
      fecha,
      ,
      categoria,
      concepto,
      montoOriginal,
      monedaOriginal,
      tipoCambioRef,
      ,
      montoBase,
      pago,
      participantes,
      ,
      ,
      ,
      notas,
    ] = line.split('\t');

    const currency = (monedaOriginal?.trim() || 'MXN') as 'MXN' | 'USD';
    const exchangeRate = currency === 'USD' ? parseNumber(tipoCambioRef || '17.5') || 17.5 : 1;
    const amount = parseNumber(montoOriginal);
    const baseAmount = parseNumber(montoBase) || Number((currency === 'USD' ? amount * exchangeRate : amount).toFixed(2));

    return {
      expense_date: fecha.trim(),
      category: categoria.trim(),
      concept: concepto.trim(),
      amount,
      currency,
      exchange_rate: exchangeRate,
      base_currency: 'MXN',
      base_amount: baseAmount,
      payer_name: pago.trim() as 'Beto' | 'Memo' | 'Cuate',
      notes: notas?.trim() ? notas.trim() : null,
      participants: (participantes || '').split('|').map((item) => item.trim()).filter(Boolean),
    };
  });
}

async function main() {
  loadEnvFile(ENV_PATH);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expenses = parseTsv(fs.readFileSync(TSV_PATH, 'utf8'));
  const participantSeed = [
    { name: 'Beto', emoji: '🏍️' },
    { name: 'Memo', emoji: '🏍️' },
    { name: 'Cuate', emoji: '🏍️' },
  ];

  const { data: existingParticipants, error: fetchParticipantsError } = await supabase
    .from('trip_participants')
    .select('id,name')
    .eq('trip_slug', TRIP_SLUG);

  if (fetchParticipantsError) throw fetchParticipantsError;

  const existingParticipantMap = new Map((existingParticipants ?? []).map((item) => [item.name, item.id]));
  const missingParticipants = participantSeed.filter((participant) => !existingParticipantMap.has(participant.name));

  if (missingParticipants.length) {
    const { error: insertParticipantsError } = await supabase.from('trip_participants').insert(
      missingParticipants.map((participant) => ({
        trip_slug: TRIP_SLUG,
        name: participant.name,
        emoji: participant.emoji,
      })),
    );

    if (insertParticipantsError) throw insertParticipantsError;
  }

  const { data: participants, error: refetchParticipantsError } = await supabase
    .from('trip_participants')
    .select('id,name')
    .eq('trip_slug', TRIP_SLUG);

  if (refetchParticipantsError) throw refetchParticipantsError;

  const participantIdByName = new Map((participants ?? []).map((item) => [item.name, item.id]));

  const { data: existingExpenses, error: fetchExpensesError } = await supabase
    .from('trip_expenses')
    .select('id')
    .eq('trip_slug', TRIP_SLUG);

  if (fetchExpensesError) throw fetchExpensesError;

  const existingExpenseIds = (existingExpenses ?? []).map((item) => item.id);
  if (existingExpenseIds.length) {
    const { error: deleteSplitsError } = await supabase.from('expense_splits').delete().in('expense_id', existingExpenseIds);
    if (deleteSplitsError) throw deleteSplitsError;

    const { error: deleteExpensesError } = await supabase.from('trip_expenses').delete().eq('trip_slug', TRIP_SLUG);
    if (deleteExpensesError) throw deleteExpensesError;
  }

  for (const expense of expenses) {
    const payerId = participantIdByName.get(expense.payer_name);
    if (!payerId) throw new Error(`No encontré participante para ${expense.payer_name}`);

    const { data: insertedExpense, error: insertExpenseError } = await supabase
      .from('trip_expenses')
      .insert({
        trip_slug: TRIP_SLUG,
        concept: expense.concept,
        category: expense.category,
        amount: expense.amount,
        currency: expense.currency,
        exchange_rate: expense.exchange_rate,
        base_currency: expense.base_currency,
        base_amount: expense.base_amount,
        paid_by: payerId,
        notes: expense.notes,
        expense_date: expense.expense_date,
      })
      .select('id')
      .single();

    if (insertExpenseError) throw insertExpenseError;

    const splitRows = expense.participants
      .map((name) => participantIdByName.get(name))
      .filter((value): value is string => Boolean(value))
      .map((participantId) => ({
        expense_id: insertedExpense.id,
        participant_id: participantId,
      }));

    if (splitRows.length) {
      const { error: insertSplitsError } = await supabase.from('expense_splits').insert(splitRows);
      if (insertSplitsError) throw insertSplitsError;
    }
  }

  console.log(`Participantes listos: ${participantSeed.length}`);
  console.log(`Gastos insertados: ${expenses.length}`);
  console.log('Seed Baja completado.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
