'use client';

/**
 * NotificacionesClient — UI catálogo de emails del sistema.
 *
 * Iniciativa notificaciones-catalogo · Sprint 3 (read-only). Lista de
 * `core.notification_definitions` agrupada por trigger_type, con drill-down
 * a un drawer que muestra config completa + últimos 20 logs.
 *
 * Sprint 4 reemplaza el preview por un form de edición + agrega test send.
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  DetailDrawer,
  DetailDrawerContent,
  DetailDrawerSection,
} from '@/components/detail-page/detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Bell, Clock, Hand, Mail, Plug, Power, PowerOff } from 'lucide-react';
import type { NotificationDefinition } from '@/lib/notifications';

type LogStats = { total: number; sent: number; failed: number; skipped: number; lastAt?: string };

type LogRow = {
  id: string;
  sent_at: string;
  status: string;
  recipients: Record<string, string[] | undefined>;
  subject: string | null;
  resend_id: string | null;
  error_message: string | null;
  empresa_id: string | null;
};

const TRIGGER_LABEL: Record<string, string> = {
  cron: 'Cron (automático)',
  manual: 'Manual (botón en UI)',
  webhook: 'Webhook',
};

const TRIGGER_ICON: Record<string, typeof Clock> = {
  cron: Clock,
  manual: Hand,
  webhook: Plug,
};

function fmtAgo(iso: string | undefined): string {
  if (!iso) return 'Nunca';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return 'hace segundos';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d}d`;
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function NotificacionesClient({
  definitions,
  logStats,
  empresas,
}: {
  definitions: NotificationDefinition[];
  logStats: Record<string, LogStats>;
  empresas: Array<{ id: string; slug: string; nombre: string }>;
}) {
  const [selected, setSelected] = useState<NotificationDefinition | null>(null);
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('');
  const [recentLogs, setRecentLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const empresaMap = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);

  const filtered = useMemo(() => {
    if (!empresaFiltro) return definitions;
    if (empresaFiltro === 'global') return definitions.filter((d) => d.empresa_id === null);
    return definitions.filter((d) => d.empresa_id === empresaFiltro);
  }, [definitions, empresaFiltro]);

  const groupedByTrigger = useMemo(() => {
    const groups = new Map<string, NotificationDefinition[]>();
    for (const def of filtered) {
      const arr = groups.get(def.trigger_type) ?? [];
      arr.push(def);
      groups.set(def.trigger_type, arr);
    }
    return groups;
  }, [filtered]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingLogs(true);
    const sb = createSupabaseBrowserClient();
    void sb
      .schema('core')
      .from('notification_log')
      .select('id, sent_at, status, recipients, subject, resend_id, error_message, empresa_id')
      .eq('definition_id', selected.id)
      .order('sent_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[notif-client] log fetch error:', error.message);
          setRecentLogs([]);
        } else {
          setRecentLogs((data ?? []) as unknown as LogRow[]);
        }
        setLoadingLogs(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Notificaciones
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Catálogo de emails que envía el sistema. Click en una fila para ver detalle, recipientes
            extra, preview del subject y últimos envíos.
          </p>
        </div>
        <span className="text-sm text-[var(--text)]/60">
          {filtered.length} de {definitions.length} definiciones
        </span>
      </header>

      <div className="flex items-center gap-3">
        <label className="text-sm text-[var(--text)]/70">Empresa:</label>
        <select
          value={empresaFiltro}
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todas</option>
          <option value="global">Solo globales (sin empresa)</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>

      {[...groupedByTrigger.entries()].map(([trigger, defs]) => {
        const Icon = TRIGGER_ICON[trigger] ?? Mail;
        return (
          <section key={trigger} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--text)]/70">
              <Icon className="h-4 w-4" /> {TRIGGER_LABEL[trigger] ?? trigger}
              <span className="text-[var(--text)]/40">({defs.length})</span>
            </h2>
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--card)] text-[var(--text)]/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Slug</th>
                    <th className="px-3 py-2 text-left font-medium">Nombre</th>
                    <th className="px-3 py-2 text-left font-medium">Empresa</th>
                    <th className="px-3 py-2 text-left font-medium">From</th>
                    <th className="px-3 py-2 text-left font-medium">Estado</th>
                    <th className="px-3 py-2 text-right font-medium">Envíos</th>
                    <th className="px-3 py-2 text-left font-medium">Último</th>
                  </tr>
                </thead>
                <tbody>
                  {defs.map((d) => {
                    const stats = logStats[d.id] ?? {
                      total: 0,
                      sent: 0,
                      failed: 0,
                      skipped: 0,
                    };
                    const emp = d.empresa_id ? empresaMap.get(d.empresa_id) : null;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelected(d)}
                        className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--accent)]/5"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-[var(--text)]/80">
                          {d.slug}
                        </td>
                        <td className="px-3 py-2 text-[var(--text)]">{d.nombre}</td>
                        <td className="px-3 py-2 text-[var(--text)]/70">
                          {emp ? emp.nombre : <span className="text-[var(--text)]/40">global</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--text)]/70">
                          {d.from_name ? `${d.from_name} <${d.from_email}>` : d.from_email}
                        </td>
                        <td className="px-3 py-2">
                          {d.activo ? (
                            <Badge tone="success">
                              <Power className="mr-1 h-3 w-3" /> Activo
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <PowerOff className="mr-1 h-3 w-3" /> Apagado
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className="text-[var(--text)]">{stats.total}</span>
                          {stats.failed > 0 ? (
                            <span className="ml-2 text-red-500">· {stats.failed} ✗</span>
                          ) : null}
                          {stats.skipped > 0 ? (
                            <span className="ml-2 text-amber-500">· {stats.skipped} ⊘</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--text)]/60">
                          {fmtAgo(stats.lastAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {selected ? (
        <DetailDrawer
          open
          onOpenChange={(o) => {
            if (!o) {
              setSelected(null);
              setRecentLogs([]);
            }
          }}
          title={selected.nombre}
          description={`Slug: ${selected.slug}`}
          size="xl"
        >
          <DetailDrawerContent>
            <DetailDrawerSection title="Configuración runtime">
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <Field
                  label="Estado"
                  value={
                    selected.activo ? (
                      <Badge tone="success">Activo</Badge>
                    ) : (
                      <Badge tone="danger">Apagado (kill switch)</Badge>
                    )
                  }
                />
                <Field
                  label="Trigger"
                  value={TRIGGER_LABEL[selected.trigger_type] ?? selected.trigger_type}
                />
                <Field
                  label="From"
                  value={`${selected.from_name ?? '—'} <${selected.from_email}>`}
                />
                <Field label="Reply-to" value={selected.reply_to ?? '—'} />
                <Field
                  label="Empresa"
                  value={
                    selected.empresa_id
                      ? (empresaMap.get(selected.empresa_id)?.nombre ?? selected.empresa_id)
                      : 'Global (sin empresa)'
                  }
                />
                <Field
                  label="Última actualización"
                  value={new Date(selected.updated_at).toLocaleString('es-MX')}
                />
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">
                  Subject template
                </div>
                <code className="block rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                  {selected.subject_template}
                </code>
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">
                  Descripción
                </div>
                <p className="text-sm text-[var(--text)]/80">{selected.descripcion ?? '—'}</p>
              </div>
            </DetailDrawerSection>

            <DetailDrawerSection title="Trigger config (read-only)">
              <pre className="overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
                {JSON.stringify(selected.trigger_config, null, 2)}
              </pre>
              {selected.trigger_type === 'cron' ? (
                <p className="mt-2 text-xs text-[var(--text)]/60">
                  Para cambiar el schedule del cron, abre un PR contra
                  <code className="mx-1">
                    {(selected.trigger_config as { defined_in?: string }).defined_in ??
                      'vercel.json'}
                  </code>
                  (no editable runtime).
                </p>
              ) : null}
            </DetailDrawerSection>

            <DetailDrawerSection title="Recipientes extra (fijos, suma del TO derivado)">
              {selected.recipients_extra.length === 0 ? (
                <p className="text-sm text-[var(--text)]/60">
                  Sin recipientes extra. El TO se deriva 100% de la lógica del handler.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {selected.recipients_extra.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Badge tone="neutral">{r.type.toUpperCase()}</Badge>
                      <code className="text-xs">{r.email}</code>
                    </li>
                  ))}
                </ul>
              )}
            </DetailDrawerSection>

            <DetailDrawerSection title="Últimos 20 envíos">
              {loadingLogs ? (
                <p className="text-sm text-[var(--text)]/60">Cargando…</p>
              ) : recentLogs.length === 0 ? (
                <p className="text-sm text-[var(--text)]/60">Sin envíos registrados aún.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-[var(--border)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--card)] text-[var(--text)]/60">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Fecha</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                        <th className="px-2 py-1.5 text-left font-medium">Para</th>
                        <th className="px-2 py-1.5 text-left font-medium">Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLogs.map((log) => (
                        <tr key={log.id} className="border-t border-[var(--border)]">
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {new Date(log.sent_at).toLocaleString('es-MX', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="px-2 py-1.5">
                            {log.status === 'sent' ? (
                              <Badge tone="success">sent</Badge>
                            ) : log.status === 'failed' ? (
                              <Badge tone="danger">failed</Badge>
                            ) : (
                              <Badge tone="warning">skipped</Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">
                            {(log.recipients.to ?? []).join(', ')}
                            {log.recipients.bcc && log.recipients.bcc.length > 0 ? (
                              <span className="text-[var(--text)]/40">
                                {' '}
                                · bcc: {log.recipients.bcc.join(', ')}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 text-[var(--text)]/80">
                            {log.subject ?? '—'}
                            {log.error_message ? (
                              <div className="text-[10px] text-red-500" title={log.error_message}>
                                {log.error_message.slice(0, 100)}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DetailDrawerSection>

            <DetailDrawerSection title="HTML del template">
              <p className="text-xs text-[var(--text)]/60">
                El HTML del body vive en código (no editable runtime — D1a). Para modificar el
                template, edita el archivo correspondiente y abre PR.
              </p>
            </DetailDrawerSection>
          </DetailDrawerContent>
        </DetailDrawer>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">{label}</div>
      <div className="text-sm text-[var(--text)]">{value}</div>
    </div>
  );
}
