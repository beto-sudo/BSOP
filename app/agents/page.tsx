'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  BrainCircuit,
  ChevronRight,
  Clock3,
  GitBranchPlus,
  Workflow,
} from 'lucide-react';

import agents from '@/data/agents.json';
import { ActionLink } from '@/components/ui/action-link';
import { SectionHeading } from '@/components/ui/section-heading';
import { ContentShell } from '@/components/ui/content-shell';
import { Surface } from '@/components/ui/surface';
import { RequireAccess } from '@/components/require-access';

type UsageSummary = {
  session_count?: number;
  total_tokens?: number;
  total_cost?: number;
  messages?: number;
};

type UsageSummaryResponse = {
  summary?: UsageSummary | null;
};

const int = (value: number) => value.toLocaleString('en-US');

const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

const statusTone = (status: string) =>
  status === 'completed'
    ? 'text-emerald-300 border-emerald-400/20 bg-emerald-400/10'
    : status === 'failed'
      ? 'text-rose-300 border-rose-400/20 bg-rose-400/10'
      : 'text-amber-200 border-amber-400/20 bg-amber-400/10';

function StatValue({
  loading,
  value,
}: {
  loading: boolean;
  value: string;
}) {
  if (loading) {
    return <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-white/10" />;
  }

  return <div className="mt-2 text-2xl font-semibold text-white">{value}</div>;
}

function StatSub({
  loading,
  value,
}: {
  loading: boolean;
  value: string;
}) {
  if (loading) {
    return <div className="mt-2 h-5 w-24 animate-pulse rounded-lg bg-white/8" />;
  }

  return <div className="mt-2 text-sm text-white/55">{value}</div>;
}

export default function AgentsPage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const response = await fetch('/api/usage/summary', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Failed to load usage summary: ${response.status}`);
        }

        const data = (await response.json()) as UsageSummaryResponse;

        if (!cancelled) {
          setSummary(data.summary ?? null);
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSummary(false);
        }
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const recentAgents = useMemo(
    () =>
      agents.recentAgents.filter((agent) => {
        if (agent.status !== 'running') {
          return true;
        }

        const looksFinished = Boolean(agent.completionSummary || agent.completedAt || agent.resultSnippet);
        return !looksFinished;
      }),
    [],
  );

  const completedDelegations = useMemo(
    () => recentAgents.filter((agent) => agent.status === 'completed').length,
    [recentAgents],
  );

  const averageDelegationTokens = useMemo(() => {
    const tokenValues = recentAgents
      .map((agent) => agent.tokenUsage ?? 0)
      .filter((value) => value > 0);

    if (!tokenValues.length) {
      return 0;
    }

    const total = tokenValues.reduce((sum, value) => sum + value, 0);
    return Math.round(total / tokenValues.length);
  }, [recentAgents]);

  const liveSessionCount = summary?.session_count ?? 0;
  const liveTotalTokens = summary?.total_tokens ?? 0;
  const liveTotalCost = summary?.total_cost ?? 0;
  const liveMessages = summary?.messages ?? 0;

  const delegationMixMax = Math.max(
    ...agents.architecture.delegationMix.map((entry) => entry.count),
    1,
  );

  return (
    <RequireAccess adminOnly>
    <ContentShell>
      <SectionHeading
        eyebrow="Agents"
        title="Agent Operations Center"
        copy="A CEO view of Claw as orchestrator — who gets delegated what, how recent runs finish, and whether the operating model is leaning on the right execution layer."
      />

      <Surface className="p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Bot className="h-4 w-4" />
              {agents.ceo.role}
            </div>

            <h2 className="mt-4 text-3xl font-semibold text-white">
              {agents.ceo.name} · {agents.ceo.primaryModel}
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">
              {agents.ceo.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <ActionLink href="/usage" label="View usage economics" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
              <Activity className="h-5 w-5 text-amber-300" />
              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">
                Delegations
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {recentAgents.length}
              </div>
              <div className="mt-2 text-sm text-white/55">
                {completedDelegations} completed · {int(liveMessages)} messages
              </div>
            </div>

            <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
              <BrainCircuit className="h-5 w-5 text-amber-300" />
              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">
                Total tokens
              </div>
              <StatValue loading={loadingSummary} value={int(liveTotalTokens)} />
              <StatSub loading={loadingSummary} value={money(liveTotalCost)} />
            </div>

            <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
              <GitBranchPlus className="h-5 w-5 text-amber-300" />
              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">
                Sessions
              </div>
              <StatValue loading={loadingSummary} value={String(liveSessionCount)} />
              <StatSub loading={loadingSummary} value="Main-session runs parsed" />
            </div>

            <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
              <Clock3 className="h-5 w-5 text-amber-300" />
              <div className="mt-4 text-xs uppercase tracking-[0.22em] text-white/40">
                Avg delegation tokens
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {int(averageDelegationTokens)}
              </div>
              <div className="mt-2 text-sm text-white/55">Tokens per child task</div>
            </div>
          </div>
        </div>
      </Surface>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.1fr_1.2fr]">
        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <Workflow className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Agent architecture</h2>
          </div>

          <p className="text-sm leading-7 text-white/60">{agents.architecture.headline}</p>

          <div className="mt-6 space-y-4">
            {agents.architecture.lanes.map((lane, index) => (
              <div
                key={lane.label}
                className="flex items-center gap-3 rounded-3xl border border-white/8 bg-white/4 p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white">
                  {index === 0 ? (
                    <Bot className="h-5 w-5 text-amber-300" />
                  ) : index === 1 ? (
                    <BrainCircuit className="h-5 w-5 text-emerald-300" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-sky-300" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{lane.label}</div>
                  <div className="mt-1 text-sm text-white/55">{lane.role}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {agents.architecture.delegationMix.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm text-white/65">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-white/8">
                  <div
                    className="h-2 rounded-full bg-amber-300"
                    style={{ width: `${(item.count / delegationMixMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <div className="mb-4 flex items-center gap-3 text-white">
            <Activity className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">Active / recent agents</h2>
          </div>

          <div className="grid gap-4">
            {recentAgents.map((agent) => {
              const modelHintSource = `${agent.task ?? ''} ${agent.resultSnippet ?? ''}`.toLowerCase();
              const modelHint = modelHintSource.includes('gpt-5')
                ? 'GPT-5.4'
                : modelHintSource.includes('minimax')
                  ? 'MiniMax'
                  : 'Subagent';

              return (
                <div
                  key={agent.toolCallId}
                  className="rounded-3xl border border-white/8 bg-white/4 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-3xl">
                      <div className="text-sm font-semibold text-white">
                        {agent.label || 'Delegated task'}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white/60">
                        {agent.taskPreview}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone(agent.status)}`}
                    >
                      {agent.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ['Runtime', agent.durationMinutes ? `${agent.durationMinutes.toFixed(1)}m` : '—'],
                      ['Tokens', agent.tokenUsage ? int(agent.tokenUsage) : '—'],
                      ['Model hint', modelHint],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-2xl border border-white/8 bg-black/10 px-4 py-3"
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                          {label}
                        </div>
                        <div className="mt-2 text-sm font-medium text-white/80">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
      </section>

      <section className="mt-10">
        <Surface className="overflow-hidden p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Task history</h2>
              <p className="mt-1 text-sm text-white/55">
                Last delegated tasks, with outcomes and snippets of what came back.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-white/45">
                <tr className="border-b border-white/8">
                  <th className="pb-3 pr-4 font-medium">When</th>
                  <th className="pb-3 pr-4 font-medium">Task</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Runtime</th>
                  <th className="pb-3 pr-4 font-medium">Tokens</th>
                  <th className="pb-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {agents.taskHistory.map((item) => (
                  <tr
                    key={item.toolCallId}
                    className="align-top border-b border-white/6 text-white/78 last:border-0"
                  >
                    <td className="py-3 pr-4 text-white/55">
                      {item.spawnedAt?.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-white">{item.label || 'Task'}</div>
                      <div className="mt-1 max-w-md text-white/50">{item.taskPreview}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {item.durationMinutes ? `${item.durationMinutes.toFixed(1)}m` : '—'}
                    </td>
                    <td className="py-3 pr-4">{item.tokenUsage ? int(item.tokenUsage) : '—'}</td>
                    <td className="max-w-lg py-3 text-white/55">
                      {item.resultSnippet || 'Still running or awaiting completion event.'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </section>
    </ContentShell>
    </RequireAccess>
  );
}
