'use client';

import { useEffect, useMemo, useState } from 'react';
import { SectionHeading, Shell, Surface } from '@/components/ui';

type ProviderTone = 'amber' | 'emerald' | 'sky' | 'violet' | 'gray';

type ModelMeta = {
  name: string;
  bestFor: string;
  pricing?: {
    input: number;
    output: number;
  };
  authType: string;
};

type UsageSummaryResponse = {
  costByModel?: Array<{
    model: string;
    label?: string;
    provider?: string;
    cost?: number;
    messages?: number;
    tokens?: number;
    formatted_cost?: string;
  }>;
  costByProvider?: Array<{
    provider?: string;
    cost?: number;
    messages?: number;
    formatted_cost?: string;
  }>;
};

type ProviderCard = {
  provider: string;
  cost: number;
  messages: number;
  modelCount: number;
  tone: ProviderTone;
};

type ModelCard = {
  id: string;
  label: string;
  provider: string;
  cost: number;
  messages: number;
  tokens: number;
  formattedCost?: string;
  tone: ProviderTone;
  meta?: ModelMeta;
};

const MODEL_META: Record<string, ModelMeta> = {
  'claude-opus-4-6': { name: 'Claude Opus 4.6', bestFor: 'Complex reasoning, planning, orchestration', pricing: { input: 5.0, output: 25.0 }, authType: 'api-key' },
  'gpt-5.4': { name: 'GPT-5.4', bestFor: 'Execution, coding, analysis, research', authType: 'oauth' },
  'gemini-3.1-pro-preview': { name: 'Gemini 3.1 Pro', bestFor: 'Web search, grounding, multimodal', pricing: { input: 1.25, output: 10.0 }, authType: 'api-key' },
  'minimax/minimax-m2.5': { name: 'MiniMax M2.5', bestFor: 'Heartbeat, lightweight tasks', authType: 'api-key' },
  'gpt-5.3-codex': { name: 'Codex', bestFor: 'Code generation via CLI', authType: 'oauth' },
  'kimi-k2.5': { name: 'Kimi K2.5', bestFor: "Devil's advocate, alternative perspective", authType: 'api-key' },
};

const PROVIDER_COLORS: Record<string, ProviderTone> = {
  anthropic: 'amber',
  openai: 'emerald',
  google: 'sky',
  minimax: 'violet',
  other: 'gray',
};

const dotTone: Record<ProviderTone, string> = {
  amber: 'bg-amber-300',
  emerald: 'bg-emerald-300',
  sky: 'bg-sky-300',
  violet: 'bg-violet-300',
  gray: 'bg-white/40',
};

const int = (value: number) => value.toLocaleString('en-US');
const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  });

function normalizeProvider(provider?: string) {
  const value = provider?.toLowerCase().trim();
  if (!value) return 'other';
  if (value.includes('anthropic')) return 'anthropic';
  if (value.includes('openai')) return 'openai';
  if (value.includes('google') || value.includes('gemini')) return 'google';
  if (value.includes('minimax')) return 'minimax';
  return value;
}

function titleCase(value: string) {
  return value
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ModelsPageSkeleton() {
  return (
    <Shell>
      <SectionHeading
        eyebrow="Models"
        title="Model Registry & Performance"
        copy="Registry of the models currently tracked in OpenClaw, with metadata for pricing, intended use, and observed performance from live usage telemetry."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Surface key={index} className="p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
            <div className="mt-4 h-9 w-28 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-40 animate-pulse rounded bg-white/5" />
          </Surface>
        ))}
      </div>

      <section className="mt-10 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Surface key={index} className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-3">
                <div className="h-6 w-36 animate-pulse rounded bg-white/10" />
                <div className="h-7 w-24 animate-pulse rounded-full bg-white/5" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
            </div>
            <div className="mt-5 h-16 animate-pulse rounded-2xl bg-white/5" />
            <div className="mt-4 h-12 animate-pulse rounded bg-white/5" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, statIndex) => (
                <div key={statIndex} className="h-20 animate-pulse rounded-2xl bg-white/5" />
              ))}
            </div>
            <div className="mt-5 h-10 animate-pulse rounded bg-white/5" />
          </Surface>
        ))}
      </section>

      <section className="mt-10">
        <Surface className="overflow-hidden p-6">
          <div className="h-6 w-44 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-white/5" />
          <div className="mt-6 h-80 animate-pulse rounded-3xl bg-white/5" />
        </Surface>
      </section>
    </Shell>
  );
}

export default function AIModelsPage() {
  const [data, setData] = useState<UsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const response = await fetch('/api/usage/summary', { cache: 'no-store' });
        const json = (await response.json()) as UsageSummaryResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setData({ costByModel: [], costByProvider: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useMemo<ModelCard[]>(() => {
    const merged = new Map<string, ModelCard>();

    for (const item of data?.costByModel ?? []) {
      const id = item.model || item.label || 'unknown-model';
      const provider = normalizeProvider(item.provider);
      const existing = merged.get(id);

      if (existing) {
        existing.cost += item.cost ?? 0;
        existing.messages += item.messages ?? 0;
        existing.tokens += item.tokens ?? 0;
        existing.formattedCost = money(existing.cost);
        continue;
      }

      merged.set(id, {
        id,
        label: item.label || MODEL_META[id]?.name || id,
        provider,
        cost: item.cost ?? 0,
        messages: item.messages ?? 0,
        tokens: item.tokens ?? 0,
        formattedCost: item.formatted_cost,
        tone: PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.other,
        meta: MODEL_META[id],
      });
    }

    return Array.from(merged.values()).sort((a, b) => b.cost - a.cost);
  }, [data]);

  const providerCards = useMemo<ProviderCard[]>(() => {
    const modelCounts = models.reduce<Record<string, number>>((acc, item) => {
      acc[item.provider] = (acc[item.provider] ?? 0) + 1;
      return acc;
    }, {});

    return (data?.costByProvider ?? [])
      .map((provider) => {
        const key = normalizeProvider(provider.provider);
        return {
          provider: key,
          cost: provider.cost ?? 0,
          messages: provider.messages ?? 0,
          modelCount: modelCounts[key] ?? 0,
          tone: PROVIDER_COLORS[key] ?? PROVIDER_COLORS.other,
        };
      })
      .sort((a, b) => b.cost - a.cost);
  }, [data, models]);

  const maxMessages = Math.max(...models.map((item) => item.messages), 1);

  if (loading) {
    return <ModelsPageSkeleton />;
  }

  return (
    <Shell>
      <SectionHeading
        eyebrow="Models"
        title="Model Registry & Performance"
        copy="Live registry of the models currently tracked in OpenClaw, enriched with static metadata and observed usage from Supabase-backed telemetry."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {providerCards.map((provider) => (
          <Surface key={provider.provider} className="p-5">
            <div className="flex items-center gap-3 text-white">
              <span className={`h-3 w-3 rounded-full ${dotTone[provider.tone]}`} />
              <div className="text-sm font-semibold capitalize">{provider.provider}</div>
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">{money(provider.cost)}</div>
            <div className="mt-2 text-sm text-white/55">
              {int(provider.messages)} messages · {provider.modelCount} active models
            </div>
          </Surface>
        ))}
      </div>

      <section className="mt-10 grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {models.map((item) => {
          const meta = item.meta;
          const relativeUsage = (item.messages / maxMessages) * 100;
          const heading = meta?.name || item.label;
          const bestFor = meta?.bestFor || 'General purpose';

          return (
            <Surface key={item.id} className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{heading}</h2>
                  <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {item.label}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm capitalize text-white/60">
                  <span className={`h-2.5 w-2.5 rounded-full ${dotTone[item.tone]}`} />
                  {item.provider}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/8 bg-black/10 p-4 text-sm text-white/70">
                {meta?.authType === 'oauth'
                  ? 'OAuth (subscription)'
                  : meta?.pricing
                    ? `${money(meta.pricing.input)} input · ${money(meta.pricing.output)} output per 1M tokens`
                    : 'Pricing metadata unavailable'}
              </div>

              <p className="mt-4 text-sm leading-7 text-white/60">{bestFor}</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Messages', int(item.messages)],
                  ['Total Cost', money(item.cost)],
                  ['Tokens', int(item.tokens)],
                  ['Auth', meta?.authType === 'oauth' ? 'OAuth' : meta?.authType === 'api-key' ? 'API key' : '—'],
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
                  <span>{relativeUsage.toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/8">
                  <div className={`h-2 rounded-full ${dotTone[item.tone]}`} style={{ width: `${relativeUsage}%` }} />
                </div>
              </div>
            </Surface>
          );
        })}
      </section>

      <section className="mt-10">
        <Surface className="overflow-hidden p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">Comparison table</h2>
            <p className="mt-2 text-sm text-white/55">All tracked models side by side, sorted by total cost descending.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="text-white/45">
                <tr className="border-b border-white/8">
                  {['Model', 'Provider', 'Messages', 'Tokens', 'Cost', 'Cost/Message'].map((label) => (
                    <th key={label} className="pb-3 pr-4 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((item) => (
                  <tr key={item.id} className="border-b border-white/6 text-white/78 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-white">{item.meta?.name || item.label}</div>
                      <div className="mt-1 text-xs text-white/45">{item.label}</div>
                    </td>
                    <td className="py-3 pr-4 capitalize">{titleCase(item.provider)}</td>
                    <td className="py-3 pr-4">{int(item.messages)}</td>
                    <td className="py-3 pr-4">{int(item.tokens)}</td>
                    <td className="py-3 pr-4 text-amber-300">{money(item.cost)}</td>
                    <td className="py-3">{money(item.messages > 0 ? item.cost / item.messages : 0)}</td>
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
