'use client';

import { useState } from 'react';
import Link from 'next/link';
import councilData from '@/data/rnd-council.json';
import { SectionHeading, Shell, Surface } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import { RequireAccess } from '@/components/require-access';

const memberTone: Record<string, string> = {
  strategist: 'border-amber-300/30 bg-amber-300/8',
  engineer: 'border-sky-300/30 bg-sky-300/8',
  analyst: 'border-emerald-300/30 bg-emerald-300/8',
  critic: 'border-rose-300/30 bg-rose-300/8',
  synthesizer: 'border-violet-300/30 bg-violet-300/8',
};

const badgeTone: Record<string, string> = {
  running: 'border-amber-400/30 bg-amber-400/12 text-amber-200',
  complete: 'border-emerald-400/30 bg-emerald-400/12 text-emerald-200',
  reviewing: 'border-sky-400/30 bg-sky-400/12 text-sky-200',
};

const priorityTone: Record<string, string> = {
  P0: 'border-rose-400/30 bg-rose-400/12 text-rose-200',
  P1: 'border-amber-400/30 bg-amber-400/12 text-amber-200',
  P2: 'border-sky-400/30 bg-sky-400/12 text-sky-200',
};

type CouncilMember = {
  id: string;
  name: string;
  model: string;
  role: string;
  emoji?: string;
};

type CouncilIdea = {
  id: string;
  title: string;
  summary: string;
  proposedBy: string;
  impact: number;
  effort: number;
  votes: Record<string, number>;
};

type CouncilRecommendation = {
  id: string;
  title: string;
  priority?: keyof typeof priorityTone;
  rationale?: string;
  description?: string;
  owner?: string;
  champion?: string;
  actionItems?: string[];
  firstSteps?: string[];
};

type CouncilDebateEntry = {
  round: string;
  topic?: string;
  highlights?: Array<{
    speaker: string;
    message: string;
  }>;
};

type CouncilMemo = {
  id: string;
  date: string;
  generatedAt?: string;
  runStarted?: string;
  title: string;
  status: keyof typeof badgeTone;
  summary: string;
  ideas?: CouncilIdea[];
  recommendations?: CouncilRecommendation[];
  debate?: CouncilDebateEntry[];
};

type CouncilStats = {
  totalSessions: number;
  totalIdeas: number;
  implementedIdeas: number;
  avgScore: number;
};

const councilMembers = councilData.config.council as CouncilMember[];
const memos = councilData.memos as CouncilMemo[];
const stats = ((councilData as { stats?: CouncilStats }).stats ?? {
  totalSessions: memos.length,
  totalIdeas: memos.reduce((sum, memo) => sum + (memo.ideas?.length ?? 0), 0),
  implementedIdeas: 0,
  avgScore: 0,
}) as CouncilStats;
const councilById = Object.fromEntries(councilMembers.map((member) => [member.id, member]));

export default function RndCouncilPage() {
  const { t, locale } = useLocale();
  const [selectedMemoId, setSelectedMemoId] = useState(memos[0].id);

  const selectedMemo = memos.find((m) => m.id === selectedMemoId) ?? memos[0];
  const isLatest = selectedMemoId === memos[0].id;
  const selectedIdeas = selectedMemo.ideas ?? [];
  const selectedDebate = selectedMemo.debate ?? [];
  const selectedRecommendations = selectedMemo.recommendations ?? [];

  const lastRunSource = selectedMemo.runStarted ?? selectedMemo.generatedAt ?? selectedMemo.date;
  const lastRun = lastRunSource
    ? new Date(lastRunSource).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  return (
    <RequireAccess adminOnly>
    <Shell>
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.02))] p-6 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.15),transparent_55%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionHeading
            eyebrow={t('rnd.eyebrow')}
            title={t('rnd.title')}
            copy={t('rnd.copy')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              [t('rnd.stat.last_run'), lastRun],
              [t('rnd.stat.next_run'), councilData.config.schedule],
              [t('rnd.stat.coverage'), t('rnd.stat.focus_areas', { count: councilData.config.scope.length })],
              [t('rnd.stat.council_size'), t('rnd.stat.models', { count: councilMembers.length })],
            ] as [string, string][]).map(([label, value]) => (
              <Surface key={label} className="border-amber-300/15 bg-[var(--bg)]/20 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-[var(--text)]/35">{label}</div>
                <div className="mt-3 text-lg font-semibold text-[var(--text)]">{value}</div>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-[var(--text)]">{t('rnd.members.title')}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.members.desc')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {councilMembers.map((member) => (
            <Surface key={member.id} className={`p-5 ${memberTone[member.id] ?? 'border-[var(--border)] bg-[var(--card)]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-3xl">{member.emoji}</div>
                <div className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--text)]/75">{member.model}</div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">{member.name}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{member.role}</p>
            </Surface>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          [t('rnd.stats.total_sessions'), String(stats.totalSessions), t('rnd.stats.total_sessions_sub')],
          [t('rnd.stats.ideas'), String(stats.totalIdeas), t('rnd.stats.ideas_sub')],
          [t('rnd.stats.implemented'), String(stats.implementedIdeas), t('rnd.stats.implemented_sub')],
          [t('rnd.stats.avg_score'), stats.avgScore.toFixed(1), t('rnd.stats.avg_score_sub')],
        ] as [string, string, string][]).map(([label, value, sub]) => (
          <Surface key={label} className="p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text)]/35">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-[var(--text)]">{value}</div>
            <div className="mt-2 text-sm text-[var(--muted)]">{sub}</div>
          </Surface>
        ))}
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-[var(--text)]">{t('rnd.archive.title')}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.archive.desc')}</p>
          </div>
          <div className="space-y-4">
            {memos.map((memo) => (
              <Link key={memo.id} href={`/rnd/${memo.id}`}>
                <Surface className="p-5 transition hover:border-amber-300/30 hover:bg-[var(--card)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-[var(--text)]/35">{memo.date}</div>
                      <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">{memo.title}</h3>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${badgeTone[memo.status] ?? badgeTone.running}`}>
                      {memo.status === 'running' ? <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" /> : null}
                      {memo.status}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{memo.summary}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">{t('rnd.archive.ideas')}</div>
                      <div className="mt-2 text-sm font-medium text-[var(--text)]/80">{t('rnd.archive.proposals', { count: memo.ideas?.length ?? 0 })}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">{t('rnd.archive.recommendations')}</div>
                      <div className="mt-2 text-sm font-medium text-[var(--text)]/80">{t('rnd.archive.ranked', { count: memo.recommendations?.length ?? 0 })}</div>
                    </div>
                  </div>
                </Surface>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text)]">
                  {isLatest ? t('rnd.latest.title') : t('rnd.selected.title')}
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {isLatest ? t('rnd.latest.desc') : t('rnd.selected.desc')}
                </p>
              </div>
              <Link href={`/rnd/${selectedMemo.id}`} className="shrink-0 text-sm font-medium text-amber-300 transition hover:text-[var(--text)]">
                {t('rnd.latest.open')}
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label htmlFor="memo-selector" className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">
                {t('rnd.selector.label')}
              </label>
              <select
                id="memo-selector"
                value={selectedMemoId}
                onChange={(e) => setSelectedMemoId(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              >
                {councilData.memos.map((memo) => (
                  <option key={memo.id} value={memo.id}>
                    {memo.date} — {memo.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Surface className="overflow-hidden p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--text)]/35">{selectedMemo.date}</div>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--text)]">{selectedMemo.title}</h3>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${badgeTone[selectedMemo.status] ?? badgeTone.running}`}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                {selectedMemo.status}
              </span>
            </div>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">{t('rnd.memo.ideas_section')}</h4>
              <div className="mt-4 space-y-4">
                {selectedIdeas.map((idea) => {
                  const proposer = councilById[idea.proposedBy];
                  return (
                    <div key={idea.id} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-amber-300">{proposer?.emoji} {proposer?.name}</div>
                          <h5 className="mt-2 text-lg font-semibold text-[var(--text)]">{idea.title}</h5>
                        </div>
                        <div className="flex gap-2 text-xs text-[var(--text)]/70">
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">{t('rnd.memo.impact', { score: idea.impact })}</span>
                          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1">{t('rnd.memo.effort', { score: idea.effort })}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{idea.summary}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-5">
                        {Object.entries(idea.votes).map(([memberId, score]) => (
                          <div key={memberId} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-3 py-3 text-center">
                            <div className="text-lg">{councilById[memberId]?.emoji}</div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text)]/35">{t('rnd.memo.vote')}</div>
                            <div className="mt-1 text-sm font-medium text-[var(--text)]/85">{score}/10</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">{t('rnd.memo.debate_section')}</h4>
              <div className="mt-4 space-y-4">
                {selectedDebate.map((round) => {
                  const roundTopic = round.topic ?? '—';
                  return (
                  <div key={round.round} className="rounded-3xl border border-[var(--border)] bg-[var(--bg)]/10 p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">{t('rnd.memo.round', { n: round.round, topic: roundTopic })}</div>
                    <div className="mt-4 space-y-3">
                      {(round.highlights ?? []).map((entry, index) => (
                        <div key={`${round.round}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                          <div className="text-sm font-medium text-[var(--text)]">{councilById[entry.speaker]?.emoji} {councilById[entry.speaker]?.name}</div>
                          <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{entry.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )})}
              </div>
            </section>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">{t('rnd.memo.recs_section')}</h4>
              <div className="mt-4 space-y-4">
                {selectedRecommendations.map((recommendation, index) => {
                  const recommendationSummary = ('rationale' in recommendation ? recommendation.rationale : recommendation.description) ?? '—';
                  const recommendationOwner = ('owner' in recommendation ? recommendation.owner : recommendation.champion) ?? '—';
                  const recommendationActions = ('actionItems' in recommendation ? recommendation.actionItems : recommendation.firstSteps) ?? [];
                  const recommendationPriority = recommendation.priority ?? 'P2';

                  return (
                    <div key={recommendation.id} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-[var(--text)]/45">{t('rnd.memo.rec_n', { n: index + 1 })}</div>
                          <h5 className="mt-2 text-lg font-semibold text-[var(--text)]">{recommendation.title}</h5>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${priorityTone[recommendationPriority]}`}>{recommendationPriority}</span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{recommendationSummary}</p>
                      <div className="mt-4 text-sm text-[var(--text)]/75">{t('rnd.memo.owner')} <span className="text-[var(--text)]">{recommendationOwner}</span></div>
                      <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                        {recommendationActions.map((item) => (
                          <li key={item} className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-4 py-3">
                            <span className="text-amber-300">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          </Surface>
        </div>
      </section>
    </Shell>
    </RequireAccess>
  );
}
