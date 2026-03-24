'use client';

import { useEffect, useMemo, useState } from 'react';
import agents from '@/data/agents.json';
import { SectionHeading, Shell, Surface } from '@/components/ui';

type SummaryResponse = {
  summary: {
    session_count: number;
    total_cost: number;
    messages: number;
    assistant_messages: number;
    cache_hit_rate: number;
  } | null;
  costByModel: { model: string; messages: number }[];
  costByProvider: { provider: string; cost: number }[];
};

type DailyResponse = {
  rows: { date: string; cost: number; messages: number }[];
};

type MessagesResponse = {
  rows: { session_id: string | null; timestamp: string | null; provider: string | null; model_label: string | null; formatted_cost: string | null; description: string | null; duration_ms: number }[];
};

const int = (value: number) => value.toLocaleString('en-US');
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 });
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const providerTone: Record<string, string> = { anthropic: 'bg-amber-300', openai: 'bg-emerald-300', google: 'bg-sky-300', minimax: 'bg-violet-300', other: 'bg-white/35' };
const projectTone: Record<string, string> = { blue: 'border-sky-400/20 bg-sky-400/10 text-sky-200', green: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200', amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200', gray: 'border-white/15 bg-white/10 text-white/70', purple: 'border-violet-400/20 bg-violet-400/10 text-violet-200' };
const projects = [
  { icon: '🧱', name: 'BSOP Platform', status: 'In Progress', color: 'blue', description: 'Static executive dashboard evolving into the central operating layer.' },
  { icon: '🧠', name: 'Coda ERP Architect', status: 'Active', color: 'green', description: 'Schema mapping, dependency tracing, and architecture reporting for Coda systems.' },
  { icon: '🦞', name: 'OpenClaw Config', status: 'Maintenance', color: 'amber', description: 'Model routing, gateway health, tools, and operational hardening.' },
  { icon: '🧳', name: 'Travel Planning', status: 'Standby', color: 'gray', description: 'Trip planning workflows, booking support, and execution checklists.' },
  { icon: '🏘️', name: 'DILESA Real Estate', status: 'Active', color: 'green', description: 'Property and commercial operations workstream for DILESA.' },
  { icon: '🏟️', name: 'RDB Sports Club', status: 'Planning', color: 'purple', description: 'Early-stage planning and operating model design for the club.' },
];

export default function AIDashboardPage() {
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [dailyData, setDailyData] = useState<DailyResponse | null>(null);
  const [messageData, setMessageData] = useState<MessagesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [summaryRes, dailyRes, messagesRes] = await Promise.all([
          fetch('/api/usage/summary', { cache: 'no-store' }),
          fetch('/api/usage/daily?days=14', { cache: 'no-store' }),
          fetch('/api/usage/messages?page=1&limit=10&range=all', { cache: 'no-store' }),
        ]);
        const [summaryJson, dailyJson, messagesJson] = await Promise.all([summaryRes.json(), dailyRes.json(), messagesRes.json()]);
        if (!cancelled) {
          setSummaryData(summaryJson);
          setDailyData(dailyJson);
          setMessageData(messagesJson);
        }
      } catch {
        if (!cancelled) {
          setSummaryData({ summary: null, costByModel: [], costByProvider: [] });
          setDailyData({ rows: [] });
          setMessageData({ rows: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const dailyTrend = dailyData?.rows ?? [];
  const recent = messageData?.rows ?? [];
  const summary = summaryData?.summary;
  const providers = summaryData?.costByProvider ?? [];
  const maxMessages = Math.max(...dailyTrend.map((item) => item.messages), 1);
  const maxCost = Math.max(...dailyTrend.map((item) => item.cost), 1);
  const providerTotal = providers.reduce((sum, item) => sum + item.cost, 0) || 1;
  const avgResponseTime = useMemo(() => recent.reduce((sum, item) => sum + item.duration_ms, 0) / Math.max(recent.length, 1) / 1000, [recent]);
  const hasData = Boolean(summary || dailyTrend.length || recent.length || providers.length);

  return (
    <Shell>
      <SectionHeading eyebrow="AI Operations" title="Command Center" copy="Master dashboard for model economics, activity flow, delegation load, and the current portfolio of AI-assisted workstreams." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total Messages', summary ? int(summary.messages) : '—', summary ? `${int(summary.assistant_messages)} assistant` : 'No data yet'],
          ['Total Cost', summary ? money(summary.total_cost) : '—', summary ? `${summary.session_count} sessions` : 'No data yet'],
          ['Active Models', String(summaryData?.costByModel.filter((item) => item.messages > 0).length ?? 0), hasData ? 'Models with observed traffic' : 'No data yet'],
          ['Avg Response Time', recent.length ? `${avgResponseTime.toFixed(1)}s` : '—', recent.length ? 'All assistant messages' : 'No data yet'],
          ['Cache Hit Rate', summary ? pct(summary.cache_hit_rate) : '—', summary ? 'Across full history' : 'No data yet'],
          ['Delegations', String(agents.ceo.totalDelegations), `${agents.ceo.completedDelegations} completed`],
        ].map(([label, value, sub]) => (
          <Surface key={String(label)} className="p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{loading ? <div className="h-8 w-28 animate-pulse rounded bg-white/10" /> : value}</div>
            <div className="mt-2 text-sm text-white/55">{sub}</div>
          </Surface>
        ))}
      </div>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Daily trend</h2>
          <p className="mt-2 text-sm text-white/55">Last 14 days with message bars and cost overlay.</p>
          {loading ? (
            <div className="mt-6 h-72 animate-pulse rounded-3xl bg-white/5" />
          ) : dailyTrend.length === 0 ? (
            <div className="mt-6 flex h-72 items-center justify-center rounded-3xl border border-white/8 bg-black/10 text-sm text-white/50">No data yet</div>
          ) : (
            <div className="mt-6 grid h-72 grid-cols-14 items-end gap-3">
              {dailyTrend.map((item) => (
                <div key={item.date} className="flex h-full flex-col justify-end gap-2">
                  <div className="relative flex-1 rounded-2xl border border-white/8 bg-black/10 p-2">
                    <div className="absolute inset-x-2 bottom-2 rounded-xl bg-white/8" style={{ height: `${Math.max((item.messages / maxMessages) * 100, item.messages ? 10 : 0)}%` }} />
                    <div className="absolute inset-x-3 rounded-full bg-amber-300" style={{ bottom: `${Math.max((item.cost / maxCost) * 100, item.cost ? 8 : 0)}%`, height: '4px' }} />
                  </div>
                  <div className="text-center text-[11px] text-white/45">{item.date.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Model distribution</h2>
          <p className="mt-2 text-sm text-white/55">Historical cost share by provider.</p>
          <div className="mt-6 space-y-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded-2xl bg-white/5" />)
            ) : providers.length === 0 ? (
              <div className="rounded-3xl border border-white/8 bg-black/10 p-4 text-sm text-white/50">No data yet</div>
            ) : providers.map((item) => (
              <div key={item.provider}>
                <div className="mb-2 flex items-center justify-between text-sm text-white/65">
                  <span className="capitalize">{item.provider}</span>
                  <span>{money(item.cost)} · {((item.cost / providerTotal) * 100).toFixed(1)}%</span>
                </div>
                <div className="h-3 rounded-full bg-white/8"><div className={`h-3 rounded-full ${providerTone[item.provider] ?? providerTone.other}`} style={{ width: `${(item.cost / providerTotal) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Surface>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">Projects tracker</h2>
          <p className="mt-2 text-sm text-white/55">Hardcoded strategic initiatives currently in the AI ops orbit.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Surface key={project.name} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-3xl">{project.icon}</div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${projectTone[project.color]}`}>{project.status}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{project.name}</h3>
              <p className="mt-2 text-sm leading-7 text-white/60">{project.description}</p>
            </Surface>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Recent activity</h2>
          <p className="mt-2 text-sm text-white/55">Last 10 entries from the assistant message log.</p>
          <div className="mt-6 space-y-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-3xl bg-white/5" />)
            ) : recent.length === 0 ? (
              <div className="rounded-3xl border border-white/8 bg-black/10 p-4 text-sm text-white/50">No data yet</div>
            ) : recent.map((item) => (
              <div key={`${item.session_id}-${item.timestamp}`} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${providerTone[item.provider ?? 'other'] ?? providerTone.other}`} />
                    <div className="text-sm font-medium text-white">{item.model_label ?? 'Unknown'}</div>
                    <div className="text-xs text-white/40">{item.timestamp ? item.timestamp.slice(0, 16).replace('T', ' ') : '—'}</div>
                  </div>
                  <div className="text-sm text-amber-300">{item.formatted_cost ?? '—'}</div>
                </div>
                <p className="mt-3 text-sm text-white/60">{item.description ?? 'No description'}</p>
              </div>
            ))}
          </div>
        </Surface>
      </section>
    </Shell>
  );
}
