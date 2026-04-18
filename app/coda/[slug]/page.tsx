import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Blocks, Columns3, Network, ShieldAlert, Sparkles, TableProperties } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { Shell } from '@/components/ui/shell';
import { Surface } from '@/components/ui/surface';
import { codaData, formatAuditTimestamp, formatInt, getHealthColor } from '@/data/coda';

export function generateStaticParams() {
  return codaData.documents.map((document) => ({ slug: document.slug }));
}

export default async function CodaDocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = codaData.documents.find((item) => item.slug === slug);

  if (!document) {
    notFound();
  }

  const healthColor = getHealthColor(document.health.avgScore);

  return (
    <RequireAccess empresa="coda">
    <Shell>
      <SectionHeading
        eyebrow="Coda Architect / Document"
        title={document.name}
        copy={document.description}
      />

      <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--text)]/40">Latest audit</div>
          <div className="mt-2 text-lg font-semibold text-[var(--text)]">{formatAuditTimestamp(document.lastAudit)}</div>
          <div className="mt-2 text-sm text-[var(--muted-foreground)]">Doc ID {document.docId}</div>
        </div>
        <Link
          href={`https://coda.io/d/_d${document.docId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent)]/12 px-4 py-3 text-sm font-medium text-[var(--accent-soft)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          Open in Coda
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-6">
        {[
          { icon: TableProperties, label: 'Tables', value: formatInt(document.stats.tables), sub: `${formatInt(document.stats.pages)} pages` },
          { icon: Columns3, label: 'Columns', value: formatInt(document.stats.columns), sub: 'Total schema width' },
          { icon: Network, label: 'Relationships', value: formatInt(document.stats.relationships), sub: 'Cross-table connections' },
          { icon: ShieldAlert, label: 'Avg health score', value: document.health.avgScore.toFixed(2), sub: `Max score ${document.health.maxScore}` , color: healthColor},
          { icon: Blocks, label: 'God tables', value: formatInt(document.health.godTables), sub: `${formatInt(document.health.highRiskCount)} high-risk tables` },
          { icon: Sparkles, label: 'KPI suggestions', value: formatInt(document.health.kpiSuggestions), sub: `${formatInt(document.health.duplicateGroups)} duplicate groups` },
        ].map((item) => (
          <Surface key={item.label} className="p-5">
            <item.icon className="h-5 w-5 text-amber-300" />
            <div className="mt-4 text-xs uppercase tracking-[0.24em] text-[var(--text)]/40">{item.label}</div>
            <div className="mt-2 text-3xl font-semibold" style={item.color ? { color: item.color } : { color: 'var(--text)' }}>
              {item.value}
            </div>
            <div className="mt-2 text-sm text-[var(--muted-foreground)]">{item.sub}</div>
          </Surface>
        ))}
      </section>

      <section className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface className="overflow-hidden p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text)]">Top risk tables</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Highest-scoring health risks in the latest audit snapshot.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[var(--text)]/45">
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-3 pr-4 font-medium">Table</th>
                  <th className="pb-3 pr-4 font-medium">Columns</th>
                  <th className="pb-3 pr-4 font-medium">Health</th>
                  <th className="pb-3 font-medium">Findings</th>
                </tr>
              </thead>
              <tbody>
                {document.topRiskTables.map((table) => (
                  <tr key={table.name} className="border-b border-[var(--border)] align-top text-[var(--text)]/78 last:border-0">
                    <td className="py-4 pr-4 font-medium text-[var(--text)]">{table.name}</td>
                    <td className="py-4 pr-4 text-[var(--text)]/65">{formatInt(table.columnCount)}</td>
                    <td className="py-4 pr-4 font-semibold" style={{ color: getHealthColor(table.healthScore) }}>
                      {table.healthScore}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        {table.findings.length ? (
                          table.findings.map((finding) => (
                            <span key={finding} className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--text)]/72">
                              {finding}
                            </span>
                          ))
                        ) : (
                          <span className="text-[var(--text)]/40">No flagged findings</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>

        <Surface className="p-6">
          <h2 className="text-xl font-semibold text-[var(--text)]">God tables</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Top 10 oversized tables by column count.</p>
          <div className="mt-5 space-y-3">
            {document.godTablesList.map((table, index) => (
              <div key={table.name} className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/35">#{index + 1}</div>
                  <div className="mt-1 text-sm font-medium text-[var(--text)]">{table.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-amber-300">{formatInt(table.columnCount)}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text)]/35">Columns</div>
                </div>
              </div>
            ))}
          </div>
        </Surface>
      </section>

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-[var(--text)]">Modules</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Functional clusters inferred from the audit’s structure analysis.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {document.modules.map((module) => (
            <Surface key={module.name} className="p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-[var(--text)]/35">Module</div>
              <div className="mt-2 text-lg font-semibold text-[var(--text)]">{module.name}</div>
              <div className="mt-4 text-3xl font-semibold text-amber-300">{formatInt(module.tableCount)}</div>
              <div className="mt-1 text-sm text-[var(--muted-foreground)]">tables classified</div>
            </Surface>
          ))}
        </div>
      </section>
    </Shell>
    </RequireAccess>
  );
}
