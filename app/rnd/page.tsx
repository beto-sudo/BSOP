import Link from 'next/link';
import councilData from '@/data/rnd-council.json';
import { SectionHeading, Shell, Surface } from '@/components/ui';

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

const councilById = Object.fromEntries(councilData.config.council.map((member) => [member.id, member]));
const latestMemo = councilData.memos[0];
const lastRun = new Date(latestMemo.runStarted).toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function RndCouncilPage() {
  return (
    <Shell>
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(255,255,255,0.02))] p-6 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.15),transparent_55%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionHeading
            eyebrow="AI Operations"
            title="R&D Council"
            copy="An autonomous research team of five AI models that pressure-test ideas, argue from different angles, and turn debate into clear operating memos for BSOP and the businesses around it."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['Last Run', lastRun],
              ['Next Run', councilData.config.schedule],
              ['Coverage', `${councilData.config.scope.length} focus areas`],
              ['Council Size', `${councilData.config.council.length} models`],
            ].map(([label, value]) => (
              <Surface key={String(label)} className="border-amber-300/15 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-white/35">{label}</div>
                <div className="mt-3 text-lg font-semibold text-white">{value}</div>
              </Surface>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">Council members</h2>
          <p className="mt-2 text-sm text-white/55">Five lenses, one memo: strategy, engineering, analysis, criticism, and synthesis.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {councilData.config.council.map((member) => (
            <Surface key={member.id} className={`p-5 ${memberTone[member.id] ?? 'border-white/10 bg-white/4'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-3xl">{member.emoji}</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">{member.model}</div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{member.name}</h3>
              <p className="mt-3 text-sm leading-7 text-white/60">{member.role}</p>
            </Surface>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total sessions', String(councilData.stats.totalSessions), 'Council runs recorded'],
          ['Ideas generated', String(councilData.stats.totalIdeas), 'Across all sessions'],
          ['Implemented ideas', String(councilData.stats.implementedIdeas), 'Moved into execution'],
          ['Avg impact score', councilData.stats.avgScore.toFixed(1), 'Council-weighted average'],
        ].map(([label, value, sub]) => (
          <Surface key={String(label)} className="p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-white/35">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
            <div className="mt-2 text-sm text-white/55">{sub}</div>
          </Surface>
        ))}
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">Memo archive</h2>
            <p className="mt-2 text-sm text-white/55">Every council run is stored as a strategic memo with ideas, debate rounds, and ranked recommendations.</p>
          </div>
          <div className="space-y-4">
            {councilData.memos.map((memo) => (
              <Link key={memo.id} href={`/rnd/${memo.id}`}>
                <Surface className="p-5 transition hover:border-amber-300/30 hover:bg-white/6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/35">{memo.date}</div>
                      <h3 className="mt-2 text-lg font-semibold text-white">{memo.title}</h3>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${badgeTone[memo.status] ?? badgeTone.running}`}>
                      {memo.status === 'running' ? <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" /> : null}
                      {memo.status}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-white/60">{memo.summary}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-black/10 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/35">Ideas</div>
                      <div className="mt-2 text-sm font-medium text-white/80">{memo.ideas.length} proposals</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/10 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/35">Recommendations</div>
                      <div className="mt-2 text-sm font-medium text-white/80">{memo.recommendations.length} ranked actions</div>
                    </div>
                  </div>
                </Surface>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Latest memo</h2>
              <p className="mt-2 text-sm text-white/55">Expanded by default while the council is still in session.</p>
            </div>
            <Link href={`/rnd/${latestMemo.id}`} className="text-sm font-medium text-amber-300 transition hover:text-white">
              Open full memo →
            </Link>
          </div>
          <Surface className="overflow-hidden p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-white/35">{latestMemo.date}</div>
                <h3 className="mt-2 text-2xl font-semibold text-white">{latestMemo.title}</h3>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${badgeTone[latestMemo.status] ?? badgeTone.running}`}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                {latestMemo.status}
              </span>
            </div>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Ideas in play</h4>
              <div className="mt-4 space-y-4">
                {latestMemo.ideas.map((idea) => {
                  const proposer = councilById[idea.proposedBy];
                  return (
                    <div key={idea.id} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-amber-300">{proposer?.emoji} {proposer?.name}</div>
                          <h5 className="mt-2 text-lg font-semibold text-white">{idea.title}</h5>
                        </div>
                        <div className="flex gap-2 text-xs text-white/70">
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">Impact {idea.impact}/10</span>
                          <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1">Effort {idea.effort}/10</span>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-white/60">{idea.summary}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-5">
                        {Object.entries(idea.votes).map(([memberId, score]) => (
                          <div key={memberId} className="rounded-2xl border border-white/8 bg-black/10 px-3 py-3 text-center">
                            <div className="text-lg">{councilById[memberId]?.emoji}</div>
                            <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/35">Vote</div>
                            <div className="mt-1 text-sm font-medium text-white/85">{score}/10</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Debate highlights</h4>
              <div className="mt-4 space-y-4">
                {latestMemo.debate.map((round) => (
                  <div key={round.round} className="rounded-3xl border border-white/8 bg-black/10 p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/35">Round {round.round} · {round.topic}</div>
                    <div className="mt-4 space-y-3">
                      {round.highlights.map((entry, index) => (
                        <div key={`${round.round}-${index}`} className="rounded-2xl border border-white/6 bg-white/4 px-4 py-3">
                          <div className="text-sm font-medium text-white">{councilById[entry.speaker]?.emoji} {councilById[entry.speaker]?.name}</div>
                          <p className="mt-2 text-sm leading-7 text-white/60">{entry.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/45">Ranked recommendations</h4>
              <div className="mt-4 space-y-4">
                {latestMemo.recommendations.map((recommendation, index) => (
                  <div key={recommendation.id} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-white/45">Recommendation #{index + 1}</div>
                        <h5 className="mt-2 text-lg font-semibold text-white">{recommendation.title}</h5>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${priorityTone[recommendation.priority] ?? priorityTone.P2}`}>{recommendation.priority}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-white/60">{recommendation.rationale}</p>
                    <div className="mt-4 text-sm text-white/75">Owner: <span className="text-white">{recommendation.owner}</span></div>
                    <ul className="mt-4 space-y-2 text-sm text-white/60">
                      {recommendation.actionItems.map((item) => (
                        <li key={item} className="flex gap-3 rounded-2xl border border-white/6 bg-black/10 px-4 py-3">
                          <span className="text-amber-300">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </Surface>
        </div>
      </section>
    </Shell>
  );
}
