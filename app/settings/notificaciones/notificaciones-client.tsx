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
import { Bell, Clock, Hand, Mail, Plug, Power, PowerOff, Send, Trash2, Plus } from 'lucide-react';
import type { NotificationDefinition, RecipientExtra } from '@/lib/notifications';
import { updateDefinitionAction, type UpdateDefinitionPatch } from './actions';

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
  // Draft del form de edición — espejo de los campos editables. Inicializa
  // desde `selected` cada vez que abre el drawer.
  const [draft, setDraft] = useState<UpdateDefinitionPatch>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'sending' | 'sent' | 'error';
    msg?: string;
  }>({ state: 'idle' });

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({
      from_email: selected.from_email,
      from_name: selected.from_name,
      reply_to: selected.reply_to,
      recipients_extra: selected.recipients_extra,
      subject_template: selected.subject_template,
      activo: selected.activo,
    });

    setSaveMsg(null);

    setTestStatus({ state: 'idle' });
    let active = true;

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

  async function handleSave(id: string) {
    setSaving(true);
    setSaveMsg(null);
    const res = await updateDefinitionAction(id, {
      from_email: draft.from_email,
      from_name: draft.from_name,
      reply_to: draft.reply_to,
      recipients_extra: draft.recipients_extra,
      subject_template: draft.subject_template,
      activo: draft.activo,
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg('✓ Cambios guardados. Recarga la página para ver el conteo actualizado.');
    } else {
      setSaveMsg(`✗ Error: ${res.error}`);
    }
  }

  async function handleTestSend(slug: string, empresaId: string | null) {
    setTestStatus({ state: 'sending', msg: 'Enviando correo de prueba…' });
    try {
      const res = await fetch('/api/notifications/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, empresaId }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        sentTo?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setTestStatus({
          state: 'error',
          msg: `✗ ${json?.error ?? `HTTP ${res.status}`}`,
        });
        return;
      }
      setTestStatus({
        state: 'sent',
        msg: `✓ Correo enviado a ${json.sentTo}`,
      });
    } catch (e) {
      setTestStatus({ state: 'error', msg: `✗ ${(e as Error).message}` });
    }
  }

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
            <DetailDrawerSection title="Configuración runtime (editable)">
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <FormField label="From email" htmlFor="fld-from-email">
                  <input
                    id="fld-from-email"
                    type="email"
                    value={draft.from_email ?? ''}
                    onChange={(e) => setDraft({ ...draft, from_email: e.target.value })}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="From name (display)" htmlFor="fld-from-name">
                  <input
                    id="fld-from-name"
                    type="text"
                    value={draft.from_name ?? ''}
                    onChange={(e) => setDraft({ ...draft, from_name: e.target.value || null })}
                    className={inputCls}
                  />
                </FormField>
                <FormField label="Reply-to" htmlFor="fld-reply-to">
                  <input
                    id="fld-reply-to"
                    type="email"
                    value={draft.reply_to ?? ''}
                    onChange={(e) => setDraft({ ...draft, reply_to: e.target.value || null })}
                    className={inputCls}
                    placeholder="(opcional)"
                  />
                </FormField>
                <FormField label="Kill switch" htmlFor="fld-activo">
                  <label className="flex h-9 items-center gap-2">
                    <input
                      id="fld-activo"
                      type="checkbox"
                      checked={draft.activo ?? true}
                      onChange={(e) => setDraft({ ...draft, activo: e.target.checked })}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text)]">
                      {draft.activo ? 'Activo' : 'Apagado'}
                    </span>
                  </label>
                </FormField>
                <Field
                  label="Trigger"
                  value={TRIGGER_LABEL[selected.trigger_type] ?? selected.trigger_type}
                />
                <Field
                  label="Empresa"
                  value={
                    selected.empresa_id
                      ? (empresaMap.get(selected.empresa_id)?.nombre ?? selected.empresa_id)
                      : 'Global (sin empresa)'
                  }
                />
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">
                  Subject template (vars `{'{firstName}'}`, `{'{fecha}'}`, `{'{empresa}'}`, `
                  {'{codigo}'}`, `{'{junta_titulo}'}`)
                </div>
                <input
                  type="text"
                  value={draft.subject_template ?? ''}
                  onChange={(e) => setDraft({ ...draft, subject_template: e.target.value })}
                  className={inputCls + ' w-full font-mono'}
                />
              </div>
              <div className="mt-4 space-y-1">
                <div className="text-xs uppercase tracking-wide text-[var(--text)]/60">
                  Descripción
                </div>
                <p className="text-sm text-[var(--text)]/80">{selected.descripcion ?? '—'}</p>
              </div>
              <p className="mt-3 text-xs text-[var(--text)]/50">
                Última actualización: {new Date(selected.updated_at).toLocaleString('es-MX')}
              </p>
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
              <p className="mb-3 text-xs text-[var(--text)]/60">
                Estos destinatarios se suman al TO/CC/BCC en cada envío. El TO principal sigue
                viniendo de la lógica del handler. Usa <code>always</code> para sumar al TO,{' '}
                <code>cc</code>/<code>bcc</code> para tipo distinto.
              </p>
              <RecipientsEditor
                value={draft.recipients_extra ?? []}
                onChange={(next) => setDraft({ ...draft, recipients_extra: next })}
              />
            </DetailDrawerSection>

            <DetailDrawerSection title="Acciones">
              {saveMsg ? (
                <p
                  className={
                    saveMsg.startsWith('✓')
                      ? 'mb-2 text-sm text-green-600'
                      : 'mb-2 text-sm text-red-500'
                  }
                >
                  {saveMsg}
                </p>
              ) : null}
              {testStatus.state !== 'idle' ? (
                <p
                  className={
                    testStatus.state === 'sent'
                      ? 'mb-2 text-sm text-green-600'
                      : testStatus.state === 'error'
                        ? 'mb-2 text-sm text-red-500'
                        : 'mb-2 text-sm text-[var(--text)]/60'
                  }
                >
                  {testStatus.msg}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave(selected.id)}
                  className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  disabled={testStatus.state === 'sending'}
                  onClick={() => void handleTestSend(selected.slug, selected.empresa_id)}
                  className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)] hover:bg-[var(--accent)]/5 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {testStatus.state === 'sending' ? 'Enviando…' : 'Enviar prueba (datos dummy)'}
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--text)]/50">
                &ldquo;Enviar prueba&rdquo; usa datos dummy hardcodeados y manda solo a tu correo de
                admin — nunca a recipientes reales.
              </p>
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

const inputCls =
  'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50';

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <label htmlFor={htmlFor} className="text-xs uppercase tracking-wide text-[var(--text)]/60">
        {label}
      </label>
      {children}
    </div>
  );
}

function RecipientsEditor({
  value,
  onChange,
}: {
  value: RecipientExtra[];
  onChange: (next: RecipientExtra[]) => void;
}) {
  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-sm text-[var(--text)]/50">Sin recipientes extra.</p>
      ) : (
        value.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={r.type}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...r, type: e.target.value as RecipientExtra['type'] };
                onChange(next);
              }}
              className={inputCls + ' w-24'}
            >
              <option value="always">always</option>
              <option value="cc">cc</option>
              <option value="bcc">bcc</option>
            </select>
            <input
              type="email"
              value={r.email}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...r, email: e.target.value };
                onChange(next);
              }}
              className={inputCls + ' flex-1'}
              placeholder="alguien@dominio.com"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--text)]/40 hover:bg-red-50 hover:text-red-500"
              aria-label="Eliminar recipiente"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={() => onChange([...value, { type: 'bcc', email: '' }])}
        className="flex h-9 items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar recipiente
      </button>
    </div>
  );
}
