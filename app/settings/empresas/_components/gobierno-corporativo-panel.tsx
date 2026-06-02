'use client';

/**
 * Panel "Gobierno corporativo" para `/settings/empresas/[slug]`.
 *
 * Iniciativa `gobierno-corporativo` · Sprint 2b. Tab nuevo con 3 secciones:
 *   1. Config (`core.gobierno_config`, 1 fila/empresa): reglamento (link a
 *      `erp.documentos`), derecho del tanto, dividendo anual, cadencia/tamaño
 *      del consejo, mandato default.
 *   2. Mayorías (`core.gobierno_mayorias`): umbral % + quórum + órgano por
 *      tipo de decisión.
 *   3. Consejeros (`core.gobierno_consejeros`): quién ostenta el voto de cada
 *      socio/familia, cargo, vitalicio, periodo de mandato.
 *
 * Acceso: página admin-only; escrituras directas por browser client (RLS exige
 * admin para UPDATE/DELETE). Decisión registrada en el planning.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldLabel } from '@/components/ui/field-label';
import { Badge } from '@/components/ui/badge';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import {
  type GobiernoConfig,
  type Mayoria,
  type Consejero,
  type Organo,
  type Cargo,
  ORGANO_LABELS,
  ORGANOS,
  CARGO_LABELS,
  CARGOS,
  mandatoLabel,
  resumenConsejo,
} from '@/lib/gobierno/gobierno';
import { type Socio } from '@/lib/gobierno/cap-table';

type DocOption = {
  id: string;
  titulo: string | null;
  fecha_emision: string | null;
  archivo_url: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase-js solo tipa public */

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--text)]/80">
        {children}
      </h4>
      {right}
    </div>
  );
}

async function openDocumento(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  archivoUrl: string | null
) {
  if (!archivoUrl) return;
  if (archivoUrl.startsWith('http')) {
    window.open(archivoUrl, '_blank');
    return;
  }
  const bucket = archivoUrl.split('/')[0];
  const path = archivoUrl.split('/').slice(1).join('/');
  const isAdjuntos = !['branding', 'logos'].includes(bucket);
  const { data, error } = await supabase.storage
    .from(isAdjuntos ? 'adjuntos' : bucket)
    .createSignedUrl(isAdjuntos ? archivoUrl : path, 3600);
  if (error || !data?.signedUrl) {
    alert(`Error al generar enlace: ${error?.message ?? 'desconocido'}`);
    return;
  }
  window.open(data.signedUrl, '_blank');
}

function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{msg}</span>
      <button type="button" onClick={onClose} className="text-red-400">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]';

// ─── Sección 1: Config ────────────────────────────────────────────────────────

type ConfigForm = {
  reglamento_documento_id: string;
  reglamento_fecha: string;
  mandato_meses_default: string;
  consejo_max_miembros: string;
  consejo_sesiones_por_anio: string;
  dividendo_anual_monto: string;
  dividendo_moneda: string;
  tanto_aplica: boolean;
  tanto_plazo_dias: string;
  tanto_orden_prelacion: string;
  notas: string;
};

function configToForm(c: GobiernoConfig | null): ConfigForm {
  return {
    reglamento_documento_id: c?.reglamento_documento_id ?? '',
    reglamento_fecha: c?.reglamento_fecha ?? '',
    mandato_meses_default: c?.mandato_meses_default != null ? String(c.mandato_meses_default) : '',
    consejo_max_miembros: c?.consejo_max_miembros != null ? String(c.consejo_max_miembros) : '',
    consejo_sesiones_por_anio:
      c?.consejo_sesiones_por_anio != null ? String(c.consejo_sesiones_por_anio) : '',
    dividendo_anual_monto: c?.dividendo_anual_monto != null ? String(c.dividendo_anual_monto) : '',
    dividendo_moneda: c?.dividendo_moneda ?? 'MXN',
    tanto_aplica: c?.tanto_aplica ?? false,
    tanto_plazo_dias: c?.tanto_plazo_dias != null ? String(c.tanto_plazo_dias) : '',
    tanto_orden_prelacion: c?.tanto_orden_prelacion ?? '',
    notas: c?.notas ?? '',
  };
}

const numOrNull = (s: string): number | null => {
  const n = Number(s);
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

function ConfigSection({ empresaId }: { empresaId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [config, setConfig] = useState<GobiernoConfig | null>(null);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ConfigForm>(() => configToForm(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [cfgRes, docsRes] = await Promise.all([
      (supabase.schema('core') as any)
        .from('gobierno_config')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle(),
      (supabase.schema('erp') as any)
        .from('documentos')
        .select('id, titulo, fecha_emision, archivo_url')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('fecha_emision', { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    if (cfgRes.error)
      setError(getSupabaseErrorMessage(cfgRes.error, 'No se pudo cargar la configuración.'));
    else setConfig((cfgRes.data ?? null) as GobiernoConfig | null);
    setDocs((docsRes.data ?? []) as DocOption[]);
  }, [supabase, empresaId]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const startEdit = () => {
    setForm(configToForm(config));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      empresa_id: empresaId,
      reglamento_documento_id: form.reglamento_documento_id || null,
      reglamento_fecha: form.reglamento_fecha || null,
      mandato_meses_default: numOrNull(form.mandato_meses_default),
      consejo_max_miembros: numOrNull(form.consejo_max_miembros),
      consejo_sesiones_por_anio: numOrNull(form.consejo_sesiones_por_anio),
      dividendo_anual_monto: numOrNull(form.dividendo_anual_monto),
      dividendo_moneda: form.dividendo_moneda.trim() || 'MXN',
      tanto_aplica: form.tanto_aplica,
      tanto_plazo_dias: numOrNull(form.tanto_plazo_dias),
      tanto_orden_prelacion: form.tanto_orden_prelacion.trim() || null,
      notas: form.notas.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await (supabase.schema('core') as any)
      .from('gobierno_config')
      .upsert(payload, { onConflict: 'empresa_id' });
    setSaving(false);
    if (err) {
      setError(getSupabaseErrorMessage(err, 'No se pudo guardar la configuración.'));
      return;
    }
    setEditing(false);
    await load();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const reglamentoDoc = config?.reglamento_documento_id
    ? docById.get(config.reglamento_documento_id)
    : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  const set = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <div className="flex items-center gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="h-3.5 w-3.5" /> Guardado
              </span>
            )}
            {editing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
          </div>
        }
      >
        Reglamento y reglas
      </SectionTitle>

      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {!editing ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Reglamento de gobierno">
            {reglamentoDoc ? (
              <button
                type="button"
                onClick={() => void openDocumento(supabase, reglamentoDoc.archivo_url)}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
              >
                {reglamentoDoc.titulo ?? '(documento)'} <ExternalLink className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-[var(--text)]/30">Sin documento ligado</span>
            )}
          </Field>
          <Field label="Fecha del reglamento" value={config?.reglamento_fecha} />
          <Field label="Mandato default" value={mandatoLabel(config?.mandato_meses_default)} />
          <Field label="Consejo — máx. miembros" value={config?.consejo_max_miembros?.toString()} />
          <Field
            label="Consejo — sesiones/año"
            value={config?.consejo_sesiones_por_anio?.toString()}
          />
          <Field
            label="Dividendo anual"
            value={
              config?.dividendo_anual_monto != null
                ? `${formatCurrency(config.dividendo_anual_monto)} ${config.dividendo_moneda}`
                : null
            }
          />
          <Field label="Derecho del tanto">
            {config?.tanto_aplica ? (
              <Badge tone="success">Aplica</Badge>
            ) : (
              <Badge tone="neutral">No aplica</Badge>
            )}
          </Field>
          {config?.tanto_aplica && (
            <>
              <Field label="Tanto — plazo (días)" value={config?.tanto_plazo_dias?.toString()} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Tanto — orden de prelación" value={config?.tanto_orden_prelacion} />
              </div>
            </>
          )}
          {config?.notas && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notas" value={config.notas} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Reglamento de gobierno (de Documentos)</FieldLabel>
            <select
              value={form.reglamento_documento_id}
              onChange={(e) => set('reglamento_documento_id', e.target.value)}
              className={inputCls}
            >
              <option value="">— Sin ligar —</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {[d.titulo ?? '(sin título)', d.fecha_emision].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </div>
          <EditNum
            label="Fecha del reglamento"
            type="date"
            value={form.reglamento_fecha}
            onChange={(v) => set('reglamento_fecha', v)}
          />
          <EditNum
            label="Mandato default (meses)"
            value={form.mandato_meses_default}
            onChange={(v) => set('mandato_meses_default', v)}
            placeholder="36"
          />
          <EditNum
            label="Consejo — máx. miembros"
            value={form.consejo_max_miembros}
            onChange={(v) => set('consejo_max_miembros', v)}
            placeholder="8"
          />
          <EditNum
            label="Consejo — sesiones/año"
            value={form.consejo_sesiones_por_anio}
            onChange={(v) => set('consejo_sesiones_por_anio', v)}
            placeholder="12"
          />
          <EditNum
            label="Dividendo anual (monto)"
            value={form.dividendo_anual_monto}
            onChange={(v) => set('dividendo_anual_monto', v)}
            placeholder="12000000"
          />
          <EditNum
            label="Moneda"
            type="text"
            value={form.dividendo_moneda}
            onChange={(v) => set('dividendo_moneda', v)}
            placeholder="MXN"
          />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={form.tanto_aplica}
              onChange={(e) => set('tanto_aplica', e.target.checked)}
              className="h-4 w-4"
            />
            Derecho del tanto aplica
          </label>
          <EditNum
            label="Tanto — plazo (días)"
            value={form.tanto_plazo_dias}
            onChange={(v) => set('tanto_plazo_dias', v)}
          />
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <FieldLabel>Tanto — orden de prelación</FieldLabel>
            <textarea
              value={form.tanto_orden_prelacion}
              onChange={(e) => set('tanto_orden_prelacion', e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="1) Otros accionistas de la sociedad del vendedor; 2) las otras 2 sociedades; 3) DILESA."
            />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3">
            <FieldLabel>Notas</FieldLabel>
            <textarea
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="min-h-[36px] rounded-xl border border-[var(--border)] bg-[var(--panel)]/50 px-3 py-2 text-sm text-[var(--text)]">
        {children ??
          (value ? <span>{value}</span> : <span className="text-[var(--text)]/30">—</span>)}
      </div>
    </div>
  );
}

function EditNum({
  label,
  value,
  onChange,
  placeholder,
  type = 'number',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'number' | 'text' | 'date';
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={type === 'number' ? 'font-mono' : ''}
      />
    </div>
  );
}

// ─── Sección 2: Mayorías ──────────────────────────────────────────────────────

type MayoriaForm = {
  tipo_decision: string;
  organo: Organo;
  quorum_pct: string;
  umbral_pct: string;
  orden: string;
  notas: string;
};

const EMPTY_MAYORIA: MayoriaForm = {
  tipo_decision: '',
  organo: 'consejo',
  quorum_pct: '',
  umbral_pct: '',
  orden: '',
  notas: '',
};

function MayoriasSection({ empresaId }: { empresaId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<Mayoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Mayoria | null>(null);
  const [form, setForm] = useState<MayoriaForm>(EMPTY_MAYORIA);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await (supabase.schema('core') as any)
      .from('gobierno_mayorias')
      .select('id, empresa_id, tipo_decision, organo, quorum_pct, umbral_pct, orden, notas')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (err) setError(getSupabaseErrorMessage(err, 'No se pudieron cargar las mayorías.'));
    else setRows((data ?? []) as Mayoria[]);
  }, [supabase, empresaId]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_MAYORIA, orden: String(rows.length + 1) });
    setFormError(null);
    setDrawerOpen(true);
  };
  const openEdit = (m: Mayoria) => {
    setEditing(m);
    setForm({
      tipo_decision: m.tipo_decision,
      organo: m.organo,
      quorum_pct: m.quorum_pct != null ? String(m.quorum_pct) : '',
      umbral_pct: String(m.umbral_pct),
      orden: String(m.orden),
      notas: m.notas ?? '',
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!form.tipo_decision.trim()) {
      setFormError('El tipo de decisión es obligatorio.');
      return;
    }
    const umbral = Number(form.umbral_pct);
    if (!Number.isFinite(umbral) || umbral <= 0 || umbral > 100) {
      setFormError('El umbral debe ser un número entre 0 y 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      tipo_decision: form.tipo_decision.trim(),
      organo: form.organo,
      quorum_pct: numOrNull(form.quorum_pct),
      umbral_pct: umbral,
      orden: Number(form.orden) || 1,
      notas: form.notas.trim() || null,
    };
    const table = (supabase.schema('core') as any).from('gobierno_mayorias');
    const { error: err } = editing
      ? await table.update(payload).eq('id', editing.id)
      : await table.insert({ ...payload, empresa_id: empresaId });
    setSaving(false);
    if (err) {
      setFormError(getSupabaseErrorMessage(err, 'No se pudo guardar.'));
      return;
    }
    setDrawerOpen(false);
    await load();
  };

  const del = async (m: Mayoria) => {
    if (!confirm(`¿Eliminar la regla "${m.tipo_decision}"?`)) return;
    const { error: err } = await (supabase.schema('core') as any)
      .from('gobierno_mayorias')
      .delete()
      .eq('id', m.id);
    if (err) setError(getSupabaseErrorMessage(err, 'No se pudo eliminar.'));
    else await load();
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        right={
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Agregar regla
          </Button>
        }
      >
        Mayorías por decisión
      </SectionTitle>
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/20 p-6 text-center text-sm text-[var(--text-muted)]">
          Sin reglas de mayoría capturadas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                {['Decisión', 'Órgano', 'Quórum', 'Umbral', ''].map((h, i) => (
                  <th
                    key={h || `m-${i}`}
                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50 ${
                      h === 'Quórum' || h === 'Umbral' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text)]">
                    {m.tipo_decision}
                    {m.notas && <div className="text-xs text-[var(--text)]/50">{m.notas}</div>}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]/70">{ORGANO_LABELS[m.organo]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]/70">
                    {m.quorum_pct != null ? `${m.quorum_pct}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--text)]">
                    {m.umbral_pct}%
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(m)}
                        className="h-7 px-2"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void del(m)}
                        className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(v) => !v && !saving && setDrawerOpen(false)}
        size="sm"
        title={editing ? 'Editar regla de mayoría' : 'Agregar regla de mayoría'}
        description="Umbral de aprobación (y quórum opcional) por tipo de decisión y órgano."
      >
        <DetailDrawerContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <FieldLabel>Tipo de decisión *</FieldLabel>
              <Input
                value={form.tipo_decision}
                onChange={(e) => setForm((p) => ({ ...p, tipo_decision: e.target.value }))}
                placeholder="Cese de consejero"
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Órgano</FieldLabel>
              <select
                value={form.organo}
                onChange={(e) => setForm((p) => ({ ...p, organo: e.target.value as Organo }))}
                className={inputCls}
              >
                {ORGANOS.map((o) => (
                  <option key={o} value={o}>
                    {ORGANO_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <EditNum
                label="Umbral % *"
                value={form.umbral_pct}
                onChange={(v) => setForm((p) => ({ ...p, umbral_pct: v }))}
                placeholder="66.67"
              />
              <EditNum
                label="Quórum %"
                value={form.quorum_pct}
                onChange={(v) => setForm((p) => ({ ...p, quorum_pct: v }))}
              />
              <EditNum
                label="Orden"
                value={form.orden}
                onChange={(v) => setForm((p) => ({ ...p, orden: v }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Notas</FieldLabel>
              <textarea
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                rows={2}
                className={inputCls}
              />
            </div>
            {formError && <ErrorBanner msg={formError} onClose={() => setFormError(null)} />}
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => void save()} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

// ─── Sección 3: Consejeros ────────────────────────────────────────────────────

type ConsejeroForm = {
  nombre: string;
  organo: Organo;
  socio_id: string;
  cargo: Cargo;
  ostenta_voto: boolean;
  vitalicio: boolean;
  periodo_inicio: string;
  periodo_fin: string;
  activo: boolean;
  notas: string;
};

const EMPTY_CONSEJERO: ConsejeroForm = {
  nombre: '',
  organo: 'consejo',
  socio_id: '',
  cargo: 'propietario',
  ostenta_voto: true,
  vitalicio: false,
  periodo_inicio: '',
  periodo_fin: '',
  activo: true,
  notas: '',
};

function ConsejerosSection({ empresaId }: { empresaId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<Consejero[]>([]);
  const [socios, setSocios] = useState<Pick<Socio, 'id' | 'nombre' | 'familia'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Consejero | null>(null);
  const [form, setForm] = useState<ConsejeroForm>(EMPTY_CONSEJERO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [conRes, socRes] = await Promise.all([
      (supabase.schema('core') as any)
        .from('gobierno_consejeros')
        .select(
          'id, empresa_id, organo, socio_id, persona_id, nombre, cargo, ostenta_voto, vitalicio, periodo_inicio, periodo_fin, activo, notas'
        )
        .eq('empresa_id', empresaId)
        .order('organo', { ascending: true })
        .order('nombre', { ascending: true }),
      (supabase.schema('core') as any)
        .from('empresa_socios')
        .select('id, nombre, familia')
        .eq('empresa_id', empresaId)
        .order('orden', { ascending: true }),
    ]);
    if (conRes.error)
      setError(getSupabaseErrorMessage(conRes.error, 'No se pudieron cargar los consejeros.'));
    else setRows((conRes.data ?? []) as Consejero[]);
    setSocios((socRes.data ?? []) as Pick<Socio, 'id' | 'nombre' | 'familia'>[]);
  }, [supabase, empresaId]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const socioLabel = useMemo(() => {
    const m = new Map(socios.map((s) => [s.id, s.familia || s.nombre]));
    return (id: string | null) => (id ? (m.get(id) ?? '(socio)') : null);
  }, [socios]);

  const resumen = useMemo(() => resumenConsejo(rows), [rows]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_CONSEJERO);
    setFormError(null);
    setDrawerOpen(true);
  };
  const openEdit = (c: Consejero) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      organo: c.organo,
      socio_id: c.socio_id ?? '',
      cargo: c.cargo,
      ostenta_voto: c.ostenta_voto,
      vitalicio: c.vitalicio,
      periodo_inicio: c.periodo_inicio ?? '',
      periodo_fin: c.periodo_fin ?? '',
      activo: c.activo,
      notas: c.notas ?? '',
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      nombre: form.nombre.trim(),
      organo: form.organo,
      socio_id: form.socio_id || null,
      cargo: form.cargo,
      ostenta_voto: form.ostenta_voto,
      vitalicio: form.vitalicio,
      periodo_inicio: form.periodo_inicio || null,
      periodo_fin: form.periodo_fin || null,
      activo: form.activo,
      notas: form.notas.trim() || null,
    };
    const table = (supabase.schema('core') as any).from('gobierno_consejeros');
    const { error: err } = editing
      ? await table
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editing.id)
      : await table.insert({ ...payload, empresa_id: empresaId });
    setSaving(false);
    if (err) {
      setFormError(getSupabaseErrorMessage(err, 'No se pudo guardar.'));
      return;
    }
    setDrawerOpen(false);
    await load();
  };

  const del = async (c: Consejero) => {
    if (!confirm(`¿Eliminar a "${c.nombre}"?`)) return;
    const { error: err } = await (supabase.schema('core') as any)
      .from('gobierno_consejeros')
      .delete()
      .eq('id', c.id);
    if (err) setError(getSupabaseErrorMessage(err, 'No se pudo eliminar.'));
    else await load();
  };

  return (
    <div className="space-y-3">
      <SectionTitle
        right={
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)]">
              Consejo: {resumen.total} · {resumen.conVoto} con voto · {resumen.vitalicios}{' '}
              vitalicios
            </span>
            <Button size="sm" onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        }
      >
        Consejeros y voto
      </SectionTitle>
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/20 p-6 text-center text-sm text-[var(--text-muted)]">
          Sin consejeros capturados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                {['Miembro', 'Órgano', 'Representa', 'Cargo', 'Voto', ''].map((h, i) => (
                  <th
                    key={h || `c-${i}`}
                    className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-[var(--border)] last:border-0 ${c.activo ? '' : 'opacity-50'}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--text)]">{c.nombre}</div>
                    <div className="flex items-center gap-1.5">
                      {c.vitalicio && <Badge tone="accent">Vitalicio</Badge>}
                      {!c.activo && <Badge tone="neutral">Inactivo</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]/70">{ORGANO_LABELS[c.organo]}</td>
                  <td className="px-3 py-2 text-[var(--text)]/70">
                    {socioLabel(c.socio_id) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]/70">{CARGO_LABELS[c.cargo]}</td>
                  <td className="px-3 py-2">
                    {c.ostenta_voto ? (
                      <Badge tone="success">Ostenta voto</Badge>
                    ) : (
                      <Badge tone="neutral">Voz</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(c)}
                        className="h-7 px-2"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void del(c)}
                        className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={(v) => !v && !saving && setDrawerOpen(false)}
        size="sm"
        title={editing ? `Editar — ${editing.nombre}` : 'Agregar consejero'}
        description="Miembro de un órgano de gobierno. Marca quién ostenta el voto de la sociedad que representa."
      >
        <DetailDrawerContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <FieldLabel>Nombre *</FieldLabel>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Gerardo Santos Benavides"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel>Órgano</FieldLabel>
                <select
                  value={form.organo}
                  onChange={(e) => setForm((p) => ({ ...p, organo: e.target.value as Organo }))}
                  className={inputCls}
                >
                  {ORGANOS.map((o) => (
                    <option key={o} value={o}>
                      {ORGANO_LABELS[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Cargo</FieldLabel>
                <select
                  value={form.cargo}
                  onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value as Cargo }))}
                  className={inputCls}
                >
                  {CARGOS.map((c) => (
                    <option key={c} value={c}>
                      {CARGO_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <FieldLabel>Representa al socio</FieldLabel>
              <select
                value={form.socio_id}
                onChange={(e) => setForm((p) => ({ ...p, socio_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Ninguno —</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.familia ? `${s.familia} (${s.nombre})` : s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={form.ostenta_voto}
                  onChange={(e) => setForm((p) => ({ ...p, ostenta_voto: e.target.checked }))}
                  className="h-4 w-4"
                />
                Ostenta el voto
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={form.vitalicio}
                  onChange={(e) => setForm((p) => ({ ...p, vitalicio: e.target.checked }))}
                  className="h-4 w-4"
                />
                Vitalicio
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
                  className="h-4 w-4"
                />
                Activo
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EditNum
                label="Periodo — inicio"
                type="date"
                value={form.periodo_inicio}
                onChange={(v) => setForm((p) => ({ ...p, periodo_inicio: v }))}
              />
              <EditNum
                label="Periodo — fin"
                type="date"
                value={form.periodo_fin}
                onChange={(v) => setForm((p) => ({ ...p, periodo_fin: v }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Notas</FieldLabel>
              <textarea
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                rows={2}
                className={inputCls}
              />
            </div>
            {formError && <ErrorBanner msg={formError} onClose={() => setFormError(null)} />}
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => void save()} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </DetailDrawerContent>
      </DetailDrawer>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function GobiernoCorporativoPanel({ empresaId }: { empresaId: string }) {
  return (
    <div className="space-y-8">
      <ConfigSection empresaId={empresaId} />
      <MayoriasSection empresaId={empresaId} />
      <ConsejerosSection empresaId={empresaId} />
    </div>
  );
}
