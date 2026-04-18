'use client';

import { ExpenseForm } from './expense-form';
import { ExpenseList } from './expense-list';
import { ParticipantsPanel } from './participants-panel';
import { SummaryPanel } from './summary-panel';
import type { ExpenseParticipantPreset } from './types';
import { useTravelExpenses } from './use-travel-expenses';

export type { ExpenseParticipantPreset } from './types';

/**
 * Travel expense tracker — orchestrator.
 *
 * Structure mirrors the components/app-shell/ split pattern:
 *   - ./types                  shared shapes + category constant
 *   - ./utils                  pure helpers (money, todayISO, hexToken, buildSettlement)
 *   - ./use-travel-expenses    state + Supabase reads/writes (hook)
 *   - ./summary-panel          top grid: totals + balance/liquidation + share button
 *   - ./participants-panel     left column top surface
 *   - ./expense-form           left column bottom surface
 *   - ./expense-list           right column surface
 *
 * Behavior preserved 1:1 — no UI, routing, data fetching, or logic changes.
 */
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
  const {
    supabase,
    participants,
    expenses,
    shareUrl,
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
  } = useTravelExpenses({
    tripSlug,
    defaultCurrency,
    defaultExchangeRate,
    baseCurrency,
    participantPresets,
  });

  async function handleCopyShareUrl() {
    await navigator.clipboard.writeText(shareUrl);
    setCopyState('Link copiado');
  }

  return (
    <div className="space-y-6">
      <SummaryPanel
        baseCurrency={baseCurrency}
        totalGeneral={totalGeneral}
        balances={summary.balances}
        settlements={summary.settlements}
        shareMode={shareMode}
        shareUrl={shareUrl}
        copyState={copyState}
        onGenerateShareLink={generateShareLink}
        onCopyShareUrl={handleCopyShareUrl}
      />

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <ParticipantsPanel
            tripName={tripName}
            participants={participants}
            loading={loading}
            saving={saving}
            participantPresets={participantPresets}
            participantDraft={participantDraft}
            onParticipantDraftChange={setParticipantDraft}
            onEnsurePresetParticipants={ensurePresetParticipants}
            onAddParticipant={addParticipant}
          />

          <ExpenseForm
            baseCurrency={baseCurrency}
            defaultExchangeRate={defaultExchangeRate}
            participants={participants}
            saving={saving}
            expenseDraft={expenseDraft}
            selectedParticipants={selectedParticipants}
            onExpenseDraftChange={setExpenseDraft}
            onSelectedParticipantsChange={setSelectedParticipants}
            onAddExpense={addExpense}
          />
        </div>

        <ExpenseList
          expenses={expenses}
          loading={loading}
          hasSupabase={Boolean(supabase)}
          paidByLabel={paidByLabel}
          splitLabel={splitLabel}
        />
      </div>
    </div>
  );
}
