'use client';

import type { FormEvent } from 'react';
import { Plus, Users } from 'lucide-react';
import { Surface } from '@/components/ui';
import type { ExpenseParticipantPreset, Participant } from './types';

type ParticipantsPanelProps = {
  tripName: string;
  participants: Participant[];
  loading: boolean;
  saving: boolean;
  participantPresets: ExpenseParticipantPreset[];
  participantDraft: { name: string; emoji: string };
  onParticipantDraftChange: (
    updater: (current: { name: string; emoji: string }) => { name: string; emoji: string },
  ) => void;
  onEnsurePresetParticipants: () => void;
  onAddParticipant: (e: FormEvent) => void;
};

export function ParticipantsPanel({
  tripName,
  participants,
  loading,
  saving,
  participantPresets,
  participantDraft,
  onParticipantDraftChange,
  onEnsurePresetParticipants,
  onAddParticipant,
}: ParticipantsPanelProps) {
  return (
    <Surface className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-white"><Users className="h-5 w-5 text-amber-300" /> <h3 className="text-lg font-semibold">Participantes</h3></div>
          <p className="mt-1 text-sm text-white/55">Base del reparto para {tripName}.</p>
        </div>
        {!participants.length && participantPresets.length ? (
          <button onClick={onEnsurePresetParticipants} className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-amber-300/40 hover:text-white">Cargar base</button>
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
      <form onSubmit={onAddParticipant} className="mt-5 grid gap-3">
        <input value={participantDraft.name} onChange={(e) => onParticipantDraftChange((current) => ({ ...current, name: e.target.value }))} placeholder="Nombre" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        <input value={participantDraft.emoji} onChange={(e) => onParticipantDraftChange((current) => ({ ...current, emoji: e.target.value }))} placeholder="Emoji opcional" className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
        <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-medium text-black transition hover:bg-amber-200 disabled:opacity-60">
          <Plus className="h-4 w-4" /> Agregar participante
        </button>
      </form>
    </Surface>
  );
}
