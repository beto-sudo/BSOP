import type { Expense, Participant, Settlement } from './types';

export function money(value: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function hexToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildSettlement(participants: Participant[], expenses: Expense[]) {
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
