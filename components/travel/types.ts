export type ExpenseParticipantPreset = { name: string; emoji?: string };

export type Participant = {
  id: string;
  name: string;
  emoji?: string | null;
};

export type Expense = {
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

export type Settlement = { from: string; to: string; amount: number };

export const categories = [
  'Hospedaje',
  'Comidas',
  'Transporte',
  'Entretenimiento',
  'Estacionamiento',
  'Otros',
];
