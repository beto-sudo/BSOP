import { Activity, Bot, BriefcaseBusiness, CalendarDays, ChevronRight, Coins, Plane, Sparkles } from 'lucide-react';
import Link from 'next/link';
import usage from '@/data/usage.json';
import agents from '@/data/agents.json';
import { codaDocs, travelTrips } from '@/data/site';
import { Shell, Surface } from '@/components/ui';

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

const recentSessions = usage.recentSessions.slice(0, 5);
const nextTrip = travelTrips[0];
const activeSessions = usage.recentSessions.filter((session) => {
  const started = new Date(session.timestamp).getTime();
  const ended = new Date(session.endedAt).getTime();
  return ended - started > 0;
}).length;
const dilesaScore = codaDocs.find((doc) => doc.slug === 'dilesa')?.healthScore;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function HomePage() {
  return (
    <Shell>
      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Surface className="p-8 sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/12 px-3 py-1 text-xs font-medium text-[var(--accent-soft)]">
            <Sparkles className="h-4 w-4" />
            Executive dashboard
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {getGreeting()}, Beto
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62 sm:text-base">
            Your operating layer for AI visibility, travel planning, business health, and the systems behind BSOP.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/usage" className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90">
              Open AI Operations
            </Link>
            <Link href="/travel" className="rounded-full border border-[var(--border)] px-5 py-3 text-sm font-semibold text-white/85 transition hover:border-[var(--accent)] hover:bg-white/5 hover:text-white">
              Open Travel
            </Link>
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="flex items-center gap-3 text-white">
            <Activity className="h-5 w-5 text-[var(--accent-soft)]" />
            <h2 className="text-lg font-semibold">Today at a glance</h2>
          </div>
          <div className="mt-6 space-y-4 text-sm text-white/72">
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-white/38">Current spend</div>
              <div className="mt-2 text-2xl font-semibold text-white">{money(usage.summary.costToday)}</div>
              <div className="mt-2 text-white/55">{usage.summary.sessionCount} sessions parsed this month.</div>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-white/38">Next trip</div>
              <div className="mt-2 text-lg font-semibold text-white">{nextTrip?.name ?? 'No trips yet'}</div>
              <div className="mt-2 text-white/55">{nextTrip ? `${nextTrip.startDate} → ${nextTrip.endDate}` : 'Travel plans will appear here.'}</div>
            </div>
          </div>
        </Surface>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { icon: Coins, label: 'AI Spend Today', value: money(usage.summary.costToday), sub: 'Current local day' },
          { icon: Coins, label: 'AI Spend This Week', value: money(usage.summary.costThisWeek), sub: 'Monday → now' },
          { icon: Coins, label: 'AI Spend This Month', value: money(usage.summary.costThisMonth), sub: 'Month to date' },
          { icon: Activity, label: 'Active Sessions', value: String(activeSessions), sub: 'Recent sessions captured' },
          { icon: Bot, label: 'Delegation Efficiency', value: `${Math.round(usage.delegation.delegatedShare * 100)}%`, sub: 'Work handled by subagents' },
        ].map((item) => (
          <Surface key={item.label} className="p-5">
            <item.icon className="h-5 w-5 text-[var(--accent-soft)]" />
            <div className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-sm text-white/55">{item.sub}</div>
          </Surface>
        ))}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
        <Surface className="p-6 xl:col-span-2">
          <div className="flex items-center gap-3 text-white">
            <BriefcaseBusiness className="h-5 w-5 text-[var(--accent-soft)]" />
            <h2 className="text-lg font-semibold">Business Health</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { name: 'ANSA', status: 'Coming soon', detail: 'Executive health card pending operating metrics.' },
              { name: 'DILESA', status: dilesaScore !== undefined ? `Health score ${dilesaScore.toFixed(1)}` : 'Coming soon', detail: 'Largest Coda architecture in the stack.' },
              { name: 'COAGAN', status: 'Coming soon', detail: 'Business diagnostics and KPIs will live here.' },
              { name: 'RDB', status: 'Coming soon', detail: 'Operations and member-side visibility coming later.' },
            ].map((business) => (
              <div key={business.name} className="rounded-3xl border border-[var(--border)] bg-white/5 p-5">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-white">{business.name}</h3>
                  <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-xs text-[var(--accent-soft)]">
                    {business.status}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-white/58">{business.detail}</p>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="flex items-center gap-3 text-white">
            <CalendarDays className="h-5 w-5 text-[var(--accent-soft)]" />
            <h2 className="text-lg font-semibold">Upcoming</h2>
          </div>
          <div className="mt-6 space-y-4 text-sm text-white/72">
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="flex items-center gap-2 text-white">
                <Plane className="h-4 w-4 text-[var(--accent-soft)]" />
                <span className="font-medium">Next trip</span>
              </div>
              <div className="mt-3 text-lg font-semibold text-white">{nextTrip?.name ?? 'No upcoming trips'}</div>
              <p className="mt-2 text-white/55">{nextTrip?.summary ?? 'Trip information will appear here.'}</p>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="text-sm font-medium text-white">Calendar</div>
              <p className="mt-2 text-white/55">No upcoming events</p>
            </div>
          </div>
        </Surface>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface className="overflow-hidden p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
              <p className="mt-1 text-sm text-white/55">Last 5 AI sessions from local usage telemetry.</p>
            </div>
            <Link href="/usage" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-soft)] transition hover:text-white">
              View all
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 space-y-3">
            {recentSessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-3 rounded-3xl border border-[var(--border)] bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{session.modelLabel}</div>
                  <div className="mt-1 text-sm text-white/52">{session.timestamp.slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-white/62">
                  <span>{session.totalTokens.toLocaleString('en-US')} tokens</span>
                  <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-[var(--accent-soft)]">
                    {session.formattedCost}
                  </span>
                  <span>{session.durationMinutes.toFixed(1)}m</span>
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="flex items-center gap-3 text-white">
            <Bot className="h-5 w-5 text-[var(--accent-soft)]" />
            <h2 className="text-lg font-semibold">Operations Snapshot</h2>
          </div>
          <div className="mt-6 space-y-4 text-sm text-white/72">
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-white/38">Delegations</div>
              <div className="mt-2 text-2xl font-semibold text-white">{agents.ceo.totalDelegations}</div>
              <div className="mt-2 text-white/55">{agents.ceo.completedDelegations} completed so far.</div>
            </div>
            <div className="rounded-3xl border border-[var(--border)] bg-white/5 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-white/38">Average delegated load</div>
              <div className="mt-2 text-2xl font-semibold text-white">{agents.ceo.averageDelegationTokens.toLocaleString('en-US')}</div>
              <div className="mt-2 text-white/55">Tokens per delegated task.</div>
            </div>
          </div>
        </Surface>
      </section>
    </Shell>
  );
}
