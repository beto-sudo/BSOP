import agents from '@/data/agents.json';
import usage from '@/data/usage.json';
import { SectionHeading, Shell, Surface } from '@/components/ui';

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
  const maxMessages = Math.max(...usage.dailyTrend.map((item) => item.messages), 1);
  const maxCost = Math.max(...usage.dailyTrend.map((item) => item.cost), 1);
  const providerTotal = usage.costByProvider.reduce((sum, item) => sum + item.cost, 0) || 1;
  const recent = usage.messageLog.slice(0, 10);

  return (
    <Shell>
      <SectionHeading eyebrow="AI Operations" title="Command Center" copy="Master dashboard for model economics, activity flow, delegation load, and the current portfolio of AI-assisted workstreams." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Total Messages', int(usage.summary.messages), `${int(usage.summary.assistantMessages)} assistant`],
          ['Total Cost', money(usage.summary.totalCost), `${usage.summary.sessionCount} sessions`],
          ['Active Models', String(usage.costByModel.filter((item) => item.messages > 0).length), 'Models with observed traffic'],
          ['Avg Response Time', `${(usage.messageLog.reduce((sum, item) => sum + item.durationMs, 0) / Math.max(usage.messageLog.length, 1) / 1000).toFixed(1)}s`, 'Last 2,000 assistant messages'],
          ['Cache Hit Rate', pct(usage.summary.cacheHitRate), 'Across full history'],
          ['Delegations', String(agents.ceo.totalDelegations), `${agents.ceo.completedDelegations} completed`],
        ].map(([label, value, sub]) => (
          <Surface key={String(label)} className="p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
            <div className="mt-2 text-sm text-white/55">{sub}</div>
          </Surface>
        ))}
      </div>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Daily trend</h2>
          <p className="mt-2 text-sm text-white/55">Last 14 days with message bars and cost overlay.</p>
          <div className="mt-6 grid h-72 grid-cols-14 items-end gap-3">
            {usage.dailyTrend.map((item) => (
              <div key={item.date} className="flex h-full flex-col justify-end gap-2">
                <div className="relative flex-1 rounded-2xl border border-white/8 bg-black/10 p-2">
                  <div className="absolute inset-x-2 bottom-2 rounded-xl bg-white/8" style={{ height: `${Math.max((item.messages / maxMessages) * 100, item.messages ? 10 : 0)}%` }} />
                  <div className="absolute inset-x-3 rounded-full bg-amber-300" style={{ bottom: `${Math.max((item.cost / maxCost) * 100, item.cost ? 8 : 0)}%`, height: '4px' }} />
                </div>
                <div className="text-center text-[11px] text-white/45">{item.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Model distribution</h2>
          <p className="mt-2 text-sm text-white/55">Historical cost share by provider.</p>
          <div className="mt-6 space-y-4">
            {usage.costByProvider.map((item) => (
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
            {recent.map((item) => (
              <div key={`${item.sessionId}-${item.timestamp}`} className="rounded-3xl border border-white/8 bg-white/4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${providerTone[item.provider] ?? providerTone.other}`} />
                    <div className="text-sm font-medium text-white">{item.modelLabel}</div>
                    <div className="text-xs text-white/40">{item.timestamp.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                  <div className="text-sm text-amber-300">{item.formattedCost}</div>
                </div>
                <p className="mt-3 text-sm text-white/60">{item.description}</p>
              </div>
            ))}
          </div>
        </Surface>
      </section>
    </Shell>
  );
}
