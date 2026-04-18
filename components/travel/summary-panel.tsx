'use client';

import { Calculator, Copy, Share2, Wallet } from 'lucide-react';
import { Surface } from '@/components/ui';
import type { Settlement } from './types';
import { money } from './utils';

type Balance = {
  participant: { id: string; name: string; emoji?: string | null };
  totalPaid: number;
  fairShare: number;
  balance: number;
};

type SummaryPanelProps = {
  baseCurrency: 'MXN' | 'USD';
  totalGeneral: number;
  balances: Balance[];
  settlements: Settlement[];
  shareMode: boolean;
  shareUrl: string;
  copyState: string;
  onGenerateShareLink: () => void;
  onCopyShareUrl: () => void;
};

export function SummaryPanel({
  baseCurrency,
  totalGeneral,
  balances,
  settlements,
  shareMode,
  shareUrl,
  copyState,
  onGenerateShareLink,
  onCopyShareUrl,
}: SummaryPanelProps) {
  return (
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
            <button onClick={onGenerateShareLink} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-amber-300/40 hover:text-amber-200">
              <Share2 className="h-4 w-4" /> Compartir viaje
            </button>
          ) : null}
        </div>
        {shareUrl ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            <div className="break-all">{shareUrl}</div>
            <button
              onClick={onCopyShareUrl}
              className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-100/90"
            >
              <Copy className="h-3.5 w-3.5" /> {copyState || 'Copiar link'}
            </button>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {balances.map((item) => (
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
          {settlements.length ? settlements.map((settlement) => (
            <div key={`${settlement.from}-${settlement.to}-${settlement.amount}`} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
              <span className="font-medium text-white">{settlement.from}</span> le debe <span className="font-medium text-white">{money(settlement.amount, baseCurrency)}</span> a <span className="font-medium text-white">{settlement.to}</span>
            </div>
          )) : <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">Sin saldos pendientes por ahora.</div>}
        </div>
      </Surface>
    </div>
  );
}
