'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Surface } from '@/components/ui';

type MessageRow = {
  timestamp: string;
  model: string;
  modelLabel: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  cost: number;
  formattedCost: string;
  durationMs: number;
  status: string;
  sessionId: string;
  skillName: string | null;
  description: string;
};

type BreakdownDay = {
  date: string;
  models: { model: string; label: string; cost: number; messages: number; tokens: number }[];
};

type UsageData = {
  summary: {
    totalCost: number;
    messages: number;
    assistantMessages: number;
    cacheHitRate: number;
  };
  usageTotals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cacheHitRate: number;
  };
  messageLog: MessageRow[];
  modelBreakdownHistory: BreakdownDay[];
  dailyTrend: { date: string; cost: number }[];
};

type SortKey = keyof Pick<MessageRow, 'timestamp' | 'modelLabel' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheCreationTokens' | 'cost' | 'durationMs' | 'status' | 'description'>;

const providerTone: Record<string, string> = {
  anthropic: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  openai: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  google: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  minimax: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  other: 'border-white/15 bg-white/10 text-white/70',
};

const modelBarTone: Record<string, string> = {
  anthropic: 'bg-amber-300',
  openai: 'bg-emerald-300',
  google: 'bg-sky-300',
  minimax: 'bg-violet-300',
  other: 'bg-white/40',
};

const int = (value: number) => value.toLocaleString('en-US');
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 });
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function startCutoff(range: string) {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range === '7d') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export function UsageDetailClient({ data }: { data: UsageData }) {
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [model, setModel] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const models = useMemo(() => Array.from(new Set(data.messageLog.map((item) => item.model))).sort(), [data.messageLog]);

  const filtered = useMemo(() => {
    const cutoff = startCutoff(range);
    const searchText = search.trim().toLowerCase();
    return data.messageLog.filter((item) => {
      const itemTime = new Date(item.timestamp).getTime();
      if (cutoff && itemTime < cutoff) return false;
      if (model !== 'all' && item.model !== model) return false;
      if (status !== 'all' && item.status !== status) return false;
      if (searchText && !item.description.toLowerCase().includes(searchText)) return false;
      return true;
    });
  }, [data.messageLog, model, range, search, status]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      let result = 0;
      if (typeof left === 'number' && typeof right === 'number') result = left - right;
      else result = String(left).localeCompare(String(right));
      return sortDirection === 'asc' ? result : -result;
    });
    return rows;
  }, [filtered, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const visibleTotals = useMemo(() => paged.reduce((acc, item) => ({
    inputTokens: acc.inputTokens + item.inputTokens,
    outputTokens: acc.outputTokens + item.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + item.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens + item.cacheCreationTokens,
    cost: acc.cost + item.cost,
    durationMs: acc.durationMs + item.durationMs,
  }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cost: 0, durationMs: 0 }), [paged]);

  const cumulative = useMemo(() => {
    let running = 0;
    return [...data.dailyTrend].sort((a, b) => a.date.localeCompare(b.date)).map((item) => {
      running += item.cost;
      return { date: item.date, value: running };
    });
  }, [data.dailyTrend]);

  const maxCumulative = Math.max(...cumulative.map((item) => item.value), 1);
  const cumulativePoints = cumulative.map((item, index) => {
    const x = cumulative.length <= 1 ? 0 : (index / (cumulative.length - 1)) * 100;
    const y = 100 - (item.value / maxCumulative) * 100;
    return `${x},${y}`;
  }).join(' ');

  const maxBreakdown = Math.max(...data.modelBreakdownHistory.map((day) => day.models.reduce((sum, item) => sum + item.cost, 0)), 1);

  const filteredTotals = useMemo(() => filtered.reduce((acc, item) => ({
    messages: acc.messages + 1,
    inputTokens: acc.inputTokens + item.inputTokens,
    outputTokens: acc.outputTokens + item.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + item.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens + item.cacheCreationTokens,
    cost: acc.cost + item.cost,
    durationMs: acc.durationMs + item.durationMs,
  }), { messages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cost: 0, durationMs: 0 }), [filtered]);

  const filteredCacheHitRate = filteredTotals.inputTokens + filteredTotals.cacheReadTokens > 0
    ? filteredTotals.cacheReadTokens / (filteredTotals.inputTokens + filteredTotals.cacheReadTokens)
    : 0;

  const isFiltered = range !== 'all' || model !== 'all' || status !== 'all' || search.trim() !== '';
  const rangeLabel = range === 'today' ? 'Today' : range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'All time';

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-10">
      {isFiltered ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/8 px-4 py-3 text-sm text-amber-200">
          Showing <span className="font-semibold text-white">{int(filtered.length)}</span> of {int(data.messageLog.length)} messages · Filter: {rangeLabel}{model !== 'all' ? ` · ${model}` : ''}{status !== 'all' ? ` · ${status}` : ''}{search.trim() ? ` · "${search.trim()}"` : ''}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Messages', value: int(filteredTotals.messages), sub: isFiltered ? `of ${int(data.summary.assistantMessages)} total` : `${int(data.summary.assistantMessages)} assistant` },
          { label: 'Cost', value: money(filteredTotals.cost), sub: isFiltered ? `of ${money(data.summary.totalCost)} total` : 'Full parsed history' },
          { label: 'Input Tokens', value: int(filteredTotals.inputTokens), sub: `${int(filteredTotals.outputTokens)} output` },
          { label: 'Cache Read', value: int(filteredTotals.cacheReadTokens), sub: `${int(filteredTotals.cacheCreationTokens)} cache create` },
          { label: 'Cache Hit Rate', value: pct(filteredCacheHitRate), sub: isFiltered ? 'Filtered selection' : 'Across assistant traffic' },
        ].map((item) => (
          <Surface key={item.label} className="p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-white/40">{item.label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-sm text-white/55">{item.sub}</div>
          </Surface>
        ))}
      </div>

      <Surface className="overflow-hidden p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Message log</h2>
            <p className="mt-2 text-sm text-white/55">Last 2,000 assistant messages with local filtering, sorting, pagination, and per-page totals.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/40">Search</label>
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-black/15 px-3 py-2 text-white/70">
                <Search className="h-4 w-4" />
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search description" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
              </div>
            </div>
            <FilterSelect label="Range" value={range} onChange={(value) => { setRange(value as 'today' | '7d' | '30d' | 'all'); setPage(1); }} options={[['today', 'Today'], ['7d', '7d'], ['30d', '30d'], ['all', 'All']]} />
            <FilterSelect label="Model" value={model} onChange={(value) => { setModel(value); setPage(1); }} options={[['all', 'All models'], ...models.map<[string, string]>((entry) => [entry, entry])]} />
            <FilterSelect label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[['all', 'All'], ['ok', 'OK'], ['error', 'Error']]} />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="text-white/45">
              <tr className="border-b border-white/8">
                {[
                  ['timestamp', 'Timestamp'], ['modelLabel', 'Model'], ['inputTokens', 'Input'], ['outputTokens', 'Output'], ['cacheReadTokens', 'Cache Read'], ['cacheCreationTokens', 'Cache Create'], ['cost', 'Cost'], ['durationMs', 'Duration'], ['status', 'Status'], ['description', 'Description'],
                ].map(([key, label]) => (
                  <th key={key} className="pb-3 pr-4 font-medium">
                    <button type="button" onClick={() => setSort(key as SortKey)} className="inline-flex items-center gap-2 transition hover:text-white">
                      {label}
                      <span className="text-[10px] text-white/25">{sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={`${item.sessionId}-${item.timestamp}-${item.description}`} className={`border-b border-white/6 align-top text-white/78 last:border-0 ${item.status !== 'ok' ? 'bg-rose-500/8' : ''}`}>
                  <td className="py-3 pr-4 text-white/55">{item.timestamp.slice(0, 16).replace('T', ' ')}</td>
                  <td className="py-3 pr-4">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${providerTone[item.provider] ?? providerTone.other}`}>{item.modelLabel}</div>
                  </td>
                  <td className="py-3 pr-4">{int(item.inputTokens)}</td>
                  <td className="py-3 pr-4">{int(item.outputTokens)}</td>
                  <td className="py-3 pr-4">{int(item.cacheReadTokens)}</td>
                  <td className="py-3 pr-4">{int(item.cacheCreationTokens)}</td>
                  <td className="py-3 pr-4 text-amber-300">{item.formattedCost}</td>
                  <td className="py-3 pr-4">{item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs ${item.status === 'ok' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/20 bg-rose-400/10 text-rose-200'}`}>{item.status}</span></td>
                  <td className="py-3 text-white/60">{item.description}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 text-white/70">
                <td className="pt-4 pr-4 font-medium">Visible totals</td>
                <td className="pt-4 pr-4">{paged.length} rows</td>
                <td className="pt-4 pr-4">{int(visibleTotals.inputTokens)}</td>
                <td className="pt-4 pr-4">{int(visibleTotals.outputTokens)}</td>
                <td className="pt-4 pr-4">{int(visibleTotals.cacheReadTokens)}</td>
                <td className="pt-4 pr-4">{int(visibleTotals.cacheCreationTokens)}</td>
                <td className="pt-4 pr-4 text-amber-300">{money(visibleTotals.cost)}</td>
                <td className="pt-4 pr-4">{visibleTotals.durationMs ? `${(visibleTotals.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                <td className="pt-4 pr-4">—</td>
                <td className="pt-4">Filtered from {int(sorted.length)} rows</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <div>Page {currentPage} of {totalPages}</div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Rows" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} options={[['25', '25'], ['50', '50'], ['100', '100']]} compact />
            <div className="flex items-center gap-2">
              <PagerButton disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Prev</PagerButton>
              <PagerButton disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</PagerButton>
            </div>
          </div>
        </div>
      </Surface>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Daily model breakdown</h2>
          <p className="mt-2 text-sm text-white/55">Cost mix for the last 14 days, stacked horizontally by model.</p>
          <div className="mt-6 space-y-4">
            {data.modelBreakdownHistory.map((day) => {
              const total = day.models.reduce((sum, item) => sum + item.cost, 0);
              return (
                <div key={day.date} className="grid grid-cols-[88px_1fr_auto] items-center gap-4">
                  <div className="text-sm text-white/55">{day.date.slice(5)}</div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
                    {day.models.length === 0 ? <div className="h-full w-full bg-white/8" /> : day.models.map((item) => <div key={item.model} className={modelBarTone[item.model.includes('minimax') ? 'minimax' : item.model.startsWith('claude') ? 'anthropic' : item.model.startsWith('gpt') ? 'openai' : item.model.includes('gemini') ? 'google' : 'other']} style={{ width: `${(item.cost / Math.max(total, 0.000001)) * ((total / maxBreakdown) * 100)}%` }} title={`${item.label}: ${money(item.cost)}`} />)}
                  </div>
                  <div className="text-sm text-white/70">{money(total)}</div>
                </div>
              );
            })}
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-white">Cumulative cost</h2>
          <p className="mt-2 text-sm text-white/55">Running total across the visible historical trend.</p>
          <div className="mt-6 rounded-3xl border border-white/8 bg-black/10 p-4">
            <svg viewBox="0 0 100 100" className="h-64 w-full overflow-visible">
              <polyline fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" points="0,100 100,100" />
              <polyline fill="none" stroke="#fcd34d" strokeWidth="2.5" points={cumulativePoints} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-white/55">
            <span>{cumulative[0]?.date ?? '—'}</span>
            <span className="text-amber-300">{money(cumulative[cumulative.length - 1]?.value ?? 0)}</span>
          </div>
        </Surface>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, compact = false }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][]; compact?: boolean }) {
  return (
    <label className={compact ? 'flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/40' : 'block'}>
      {!compact ? <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/40">{label}</span> : <span>{label}</span>}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-[var(--border)] bg-black/15 px-3 py-2 text-sm text-white outline-none">
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function PagerButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-2xl border border-[var(--border)] bg-black/15 px-3 py-2 text-white transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{children}</button>;
}
