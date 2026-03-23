import models from '@/data/models.json';
import { SectionHeading, Shell, Surface } from '@/components/ui';

const int = (value: number) => value.toLocaleString('en-US');
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 });
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const dotTone: Record<string, string> = { amber: 'bg-amber-300', emerald: 'bg-emerald-300', sky: 'bg-sky-300', violet: 'bg-violet-300', gray: 'bg-white/40' };
const maxMessages = Math.max(...models.models.map((item) => item.stats.totalMessages), 1);

export default function AIModelsPage() {
  return (
    <Shell>
      <SectionHeading eyebrow="Models" title="Model Registry & Performance" copy="Registry of the models currently tracked in OpenClaw, with metadata for pricing, intended use, and observed performance from manifest telemetry." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {models.providerBreakdown.map((provider) => (
          <Surface key={provider.provider} className="p-5">
            <div className="flex items-center gap-3 text-white">
              <span className={`h-3 w-3 rounded-full ${dotTone[provider.color] ?? dotTone.gray}`} />
              <div className="text-sm font-semibold">{provider.provider}</div>
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">{money(provider.totalCost)}</div>
            <div className="mt-2 text-sm text-white/55">{int(provider.messages)} messages · {provider.models} active models</div>
          </Surface>
        ))}
      </div>

      <section className="mt-10 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {models.models.map((item) => (
          <Surface key={item.id} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">{item.name}</h2>
                <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">{item.alias}</div>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span className={`h-2.5 w-2.5 rounded-full ${dotTone[item.providerColor] ?? dotTone.gray}`} />
                {item.provider}
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-white/70">
              {item.authType === 'oauth' ? 'OAuth (subscription)' : `${money(item.pricing.input)} input · ${money(item.pricing.output)} output per 1M tokens`}
            </div>
            <p className="mt-4 text-sm leading-7 text-white/60">{item.bestFor}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ['Messages', int(item.stats.totalMessages)],
                ['Total Cost', money(item.stats.totalCost)],
                ['Avg Duration', item.stats.avgDuration ? `${(item.stats.avgDuration / 1000).toFixed(1)}s` : '—'],
                ['Cache Hit', pct(item.stats.cacheHitRate)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
                  <div className="mt-2 text-sm font-medium text-white/85">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-sm text-white/60">
                <span>Relative usage</span>
                <span>{((item.stats.totalMessages / maxMessages) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8"><div className={`h-2 rounded-full ${dotTone[item.providerColor] ?? dotTone.gray}`} style={{ width: `${(item.stats.totalMessages / maxMessages) * 100}%` }} /></div>
            </div>
          </Surface>
        ))}
      </section>

      <section className="mt-10">
        <Surface className="overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">Comparison table</h2>
            <p className="mt-2 text-sm text-white/55">All tracked models side by side, sorted by total cost descending.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="text-white/45">
                <tr className="border-b border-white/8">
                  {['Model', 'Provider', 'Messages', 'Input Tokens', 'Output Tokens', 'Cache Rate', 'Avg Duration', 'Total Cost', 'Cost/Message'].map((label) => <th key={label} className="pb-3 pr-4 font-medium">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {models.comparison.map((item) => (
                  <tr key={item.id} className="border-b border-white/6 text-white/78 last:border-0">
                    <td className="py-3 pr-4"><div className="font-medium text-white">{item.name}</div><div className="mt-1 text-xs text-white/45">{item.alias}</div></td>
                    <td className="py-3 pr-4">{item.provider}</td>
                    <td className="py-3 pr-4">{int(item.totalMessages)}</td>
                    <td className="py-3 pr-4">{int(item.inputTokens)}</td>
                    <td className="py-3 pr-4">{int(item.outputTokens)}</td>
                    <td className="py-3 pr-4">{pct(item.cacheHitRate)}</td>
                    <td className="py-3 pr-4">{item.avgDuration ? `${(item.avgDuration / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="py-3 pr-4 text-amber-300">{money(item.totalCost)}</td>
                    <td className="py-3">{money(item.costPerMessage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </section>
    </Shell>
  );
}
