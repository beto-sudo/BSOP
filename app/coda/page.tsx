import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Blocks,
  FileBarChart,
  FolderKanban,
  GitBranch,
  Grid2x2,
  LayoutDashboard,
  Network,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Target,
  Waypoints,
} from 'lucide-react';
import { SectionHeading, Shell, Surface } from '@/components/ui';
import { codaData, formatAuditTimestamp, formatInt, getHealthColor } from '@/data/coda';

const processIcons = [ScanSearch, GitBranch, Activity, Blocks, ShieldAlert, Target, Waypoints, FileBarChart];
const totalDocuments = codaData.documents.length;

export default function CodaPage() {
  return (
    <Shell>
      <SectionHeading
        eyebrow="Coda Architect"
        title="Five audited Coda systems, organized into one executive layer"
        copy={`Real audit artifacts are compiled into this dashboard on every data refresh. Current snapshot generated ${new Date(codaData.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.`}
      />

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-6">
        {[
          { icon: FolderKanban, label: 'Documents audited', value: formatInt(totalDocuments), sub: 'Five operating documents tracked' },
          { icon: LayoutDashboard, label: 'Tables', value: formatInt(codaData.totals.totalTables), sub: 'Across all audited documents' },
          { icon: Grid2x2, label: 'Columns', value: formatInt(codaData.totals.totalColumns), sub: 'Schema breadth in production' },
          { icon: Network, label: 'Relationships', value: formatInt(codaData.totals.totalRelationships), sub: 'Detected cross-table links' },
          { icon: ShieldAlert, label: 'God tables', value: formatInt(codaData.totals.totalGodTables), sub: 'Oversized risk concentration' },
          { icon: Sparkles, label: 'KPI suggestions', value: formatInt(codaData.totals.totalKpiSuggestions), sub: 'Metrics opportunities identified' },
        ].map((item) => (
          <Surface key={item.label} className="p-5">
            <item.icon className="h-5 w-5 text-amber-300" />
            <div className="mt-4 text-xs uppercase tracking-[0.24em] text-white/40">{item.label}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
            <div className="mt-2 text-sm text-white/55">{item.sub}</div>
          </Surface>
        ))}
      </section>

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">How Coda Architect Works</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/60">
            The audit pipeline starts with raw schema extraction, then moves through structural analysis, health scoring, risk detection, and reporting.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {codaData.process.steps.map((step, index) => {
            const Icon = processIcons[index] ?? FileBarChart;
            return (
              <Surface key={step.step} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-amber-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/12 px-3 py-1 text-xs font-semibold text-[var(--accent-soft)]">
                    Step {step.step}
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{step.name}</h3>
                <p className="mt-2 text-sm leading-7 text-white/60">{step.description}</p>
              </Surface>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Audit types</h2>
          <p className="mt-2 text-sm leading-7 text-white/60">Three levels of coverage depending on whether you need a quick pulse, a full architecture review, or change tracking.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {codaData.process.auditTypes.map((item) => (
            <Surface key={item.name} className="p-6">
              <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-amber-200/75">
                {item.name}
              </div>
              <p className="mt-4 text-sm leading-7 text-white/62">{item.description}</p>
            </Surface>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">Documents</h2>
          <p className="mt-2 text-sm leading-7 text-white/60">Each card links to a document-specific dashboard with top risk tables, god tables, and module distribution.</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          {codaData.documents.map((doc) => {
            const color = getHealthColor(doc.health.avgScore);
            return (
              <Surface key={doc.slug} className="p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-white/40">{doc.slug}</div>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{doc.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/60">{doc.description}</p>
                  </div>
                  <div className="min-w-36 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-right">
                    <div className="text-xs uppercase tracking-[0.22em] text-white/45">Avg health</div>
                    <div className="mt-1 text-3xl font-semibold" style={{ color }}>
                      {doc.health.avgScore.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Tables / Columns', `${formatInt(doc.stats.tables)} / ${formatInt(doc.stats.columns)}`],
                    ['Relationships', formatInt(doc.stats.relationships)],
                    ['God tables', formatInt(doc.health.godTables)],
                    ['KPI suggestions', formatInt(doc.health.kpiSuggestions)],
                    ['Duplicate groups', formatInt(doc.health.duplicateGroups)],
                    ['Last audit', formatAuditTimestamp(doc.lastAudit)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
                      <div className="mt-2 text-sm font-medium text-white/80">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/8 pt-5">
                  <div className="text-sm text-white/50">Top risk table: {doc.topRiskTables[0]?.name ?? 'None'}</div>
                  <Link href={`/coda/${doc.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-soft)] transition hover:text-white">
                    View Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Surface>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}
