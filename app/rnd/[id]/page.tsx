'use client';

import { notFound } from 'next/navigation';
import { useParams } from 'next/navigation';
import councilData from '@/data/rnd-council.json';
import { ContentShell } from '@/components/ui/content-shell';
import { Surface } from '@/components/ui/surface';
import { useLocale } from '@/lib/i18n';
import { RequireAccess } from '@/components/require-access';

const memberTone: Record<string, string> = {
  strategist: 'border-amber-300/30 bg-amber-300/8 text-amber-200',
  engineer: 'border-sky-300/30 bg-sky-300/8 text-sky-200',
  analyst: 'border-emerald-300/30 bg-emerald-300/8 text-emerald-200',
  critic: 'border-rose-300/30 bg-rose-300/8 text-rose-200',
  synthesizer: 'border-violet-300/30 bg-violet-300/8 text-violet-200',
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

const statusTone: Record<string, string> = {
  'next-up': 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  planning: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  monitoring: 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/75',
  shipped: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
};

type CouncilMember = {
  id: string;
  name: string;
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
  summary?: string;
  rationale?: string;
  description?: string;
  priority?: keyof typeof priorityTone;
  implementationStatus?: keyof typeof statusTone;
  owner?: string;
  champion?: string;
  timeline?: string;
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
  scores?: Record<string, number>;
};

const councilMembers = councilData.config.council as CouncilMember[];
const memos = councilData.memos as CouncilMemo[];
const councilById = Object.fromEntries(councilMembers.map((member) => [member.id, member]));

export default function RndMemoDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { t, locale } = useLocale();

  const memo = memos.find((entry) => entry.id === id);
  if (!memo) notFound();

  const lastRunSource = memo.runStarted ?? memo.generatedAt ?? memo.date;
  const lastRun = lastRunSource
    ? new Date(lastRunSource).toLocaleString(locale === 'es' ? 'es-MX' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';
  const ideas = memo.ideas ?? [];
  const recommendations = memo.recommendations ?? [];
  const debate = memo.debate ?? [];
  const scores = memo.scores ?? {};

  return (
    <RequireAccess adminOnly>
      <ContentShell>
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Surface className="overflow-hidden border-amber-300/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.02))] p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80">
              {t('rnd.detail.eyebrow')}
            </div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm text-[var(--text)]/45">
                  {t('rnd.detail.memo_label', { date: memo.date })}
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
                  {memo.title}
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
                  {memo.summary}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${badgeTone[memo.status] ?? badgeTone.running}`}
              >
                {memo.status === 'running' ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                ) : null}
                {memo.status}
              </span>
            </div>
          </Surface>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [t('rnd.detail.stat.last_run'), lastRun],
                [t('rnd.detail.stat.next_run'), councilData.config.schedule],
                [
                  t('rnd.detail.stat.ideas'),
                  t('rnd.detail.stat.ideas_val', { count: ideas.length }),
                ],
                [
                  t('rnd.detail.stat.recs'),
                  t('rnd.detail.stat.recs_val', { count: recommendations.length }),
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <Surface key={label} className="p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-[var(--text)]/35">
                  {label}
                </div>
                <div className="mt-3 text-lg font-semibold text-[var(--text)]">{value}</div>
              </Surface>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Surface className="p-6">
            <h2 className="text-xl font-semibold text-[var(--text)]">
              {t('rnd.detail.ideas_title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.detail.ideas_desc')}</p>
            <div className="mt-6 space-y-4">
              {ideas.map((idea) => {
                const proposer = councilById[idea.proposedBy];
                return (
                  <div
                    key={idea.id}
                    className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${memberTone[idea.proposedBy] ?? 'border-[var(--border)] bg-[var(--card)] text-[var(--text)]/70'}`}
                        >
                          {proposer?.emoji} {proposer?.name}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-[var(--text)]">
                          {idea.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                          Impact {idea.impact}/10
                        </span>
                        <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-200">
                          Effort {idea.effort}/10
                        </span>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{idea.summary}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      {Object.entries(idea.votes).map(([memberId, score]) => (
                        <div
                          key={memberId}
                          className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-3 py-3 text-center"
                        >
                          <div className="text-lg">{councilById[memberId]?.emoji}</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--text)]/35">
                            {councilById[memberId]?.name}
                          </div>
                          <div className="mt-1 text-sm font-medium text-[var(--text)]/85">
                            {score}/10
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>

          <Surface className="p-6">
            <h2 className="text-xl font-semibold text-[var(--text)]">
              {t('rnd.detail.scoring_title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.detail.scoring_desc')}</p>
            <div className="mt-6 grid grid-cols-[88px_repeat(10,minmax(0,1fr))] gap-2 text-xs">
              <div />
              {Array.from({ length: 10 }, (_, index) => (
                <div key={`x-${index + 1}`} className="text-center text-[var(--text)]/35">
                  {index + 1}
                </div>
              ))}
              {Array.from({ length: 10 }, (_, rowIndex) => {
                const impact = 10 - rowIndex;
                return (
                  <>
                    <div key={`y-${impact}`} className="flex items-center text-[var(--text)]/35">
                      {t('rnd.detail.impact_label', { n: impact })}
                    </div>
                    {Array.from({ length: 10 }, (_, colIndex) => {
                      const effort = colIndex + 1;
                      const match = ideas.find(
                        (idea) => idea.impact === impact && idea.effort === effort
                      );
                      return (
                        <div
                          key={`${impact}-${effort}`}
                          className="flex aspect-square items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 p-1 text-center"
                        >
                          {match ? (
                            <div className="rounded-xl border border-amber-300/20 bg-amber-300/12 px-2 py-1 text-[10px] font-medium text-amber-100">
                              {match.title.split(' ').slice(0, 2).join(' ')}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                );
              })}
            </div>
            <div className="mt-4 text-right text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">
              {t('rnd.detail.effort_arrow')}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {Object.entries(scores).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4"
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">
                    {label.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    {Number(value).toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </section>

        <section className="mt-10 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Surface className="p-6">
            <h2 className="text-xl font-semibold text-[var(--text)]">
              {t('rnd.detail.debate_title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.detail.debate_desc')}</p>
            <div className="mt-6 space-y-4">
              {debate.map((round, index) => (
                <details
                  key={round.round}
                  className="group rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"
                  open={index === 0}
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--text)]/35">
                          {t('rnd.detail.round_label', { n: round.round })}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-[var(--text)]">
                          {round.topic ?? '—'}
                        </div>
                      </div>
                      <div className="text-sm text-amber-300 transition group-open:rotate-90">
                        ›
                      </div>
                    </div>
                  </summary>
                  <div className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
                    {(round.highlights ?? []).map((entry, highlightIndex) => (
                      <div
                        key={`${round.round}-${highlightIndex}`}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-4 py-4"
                      >
                        <div className="text-sm font-medium text-[var(--text)]">
                          {councilById[entry.speaker]?.emoji} {councilById[entry.speaker]?.name}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                          {entry.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Surface>

          <Surface className="p-6">
            <h2 className="text-xl font-semibold text-[var(--text)]">
              {t('rnd.detail.recs_title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{t('rnd.detail.recs_desc')}</p>
            <div className="mt-6 space-y-4">
              {recommendations.map((recommendation, index) => {
                const recommendationSummary =
                  ('rationale' in recommendation
                    ? recommendation.rationale
                    : recommendation.description) ?? '—';
                const recommendationOwner =
                  ('owner' in recommendation ? recommendation.owner : recommendation.champion) ??
                  '—';
                const recommendationActions =
                  ('actionItems' in recommendation
                    ? recommendation.actionItems
                    : recommendation.firstSteps) ?? [];
                const recommendationPriority = recommendation.priority ?? 'P2';
                const recommendationStatus = recommendation.implementationStatus ?? 'monitoring';

                return (
                  <div
                    key={recommendation.id}
                    className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-[var(--text)]/45">
                          {t('rnd.detail.rec_n', { n: index + 1 })}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-[var(--text)]">
                          {recommendation.title}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${priorityTone[recommendationPriority]}`}
                        >
                          {recommendationPriority}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone[recommendationStatus]}`}
                        >
                          {recommendationStatus}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                      {recommendationSummary}
                    </p>
                    <div className="mt-4 text-sm text-[var(--text)]/75">
                      {t('rnd.detail.owner')}{' '}
                      <span className="text-[var(--text)]">{recommendationOwner}</span>
                    </div>
                    <div className="mt-5 space-y-2">
                      {recommendationActions.map((item, itemIndex) => (
                        <div
                          key={item}
                          className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/10 px-4 py-3 text-sm text-[var(--muted)]"
                        >
                          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-[11px] font-medium text-amber-200">
                            {itemIndex + 1}
                          </span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </section>
      </ContentShell>
    </RequireAccess>
  );
}
