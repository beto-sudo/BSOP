'use client';

/**
 * Panel "Actas de asamblea" para `/settings/empresas/[slug]`.
 *
 * Iniciativa `gobierno-corporativo` · Sprint 3. Repositorio de actas
 * (`core.gobierno_actas`) con su detalle: orden del día, acuerdos
 * (`gobierno_acta_acuerdos`) con voto por socio (`gobierno_acta_votos`),
 * asistentes/quórum (`gobierno_acta_asistentes`), protocolización notarial y
 * link al PDF en `erp.documentos`.
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
import { AlertTriangle, ExternalLink, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  type Acta,
  type ActaTipo,
  type ActaEstado,
  type Acuerdo,
  type Voto,
  type Asistente,
  type Sentido,
  type ResultadoAcuerdo,
  ACTA_TIPO_LABELS,
  ACTA_ESTADO_LABELS,
  SENTIDO_LABELS,
  SENTIDOS,
  RESULTADO_LABELS,
  RESULTADOS,
  quorumDerivado,
  tallyVotos,
  tallyLabel,
  parseOrdenDia,
} from '@/lib/gobierno/actas';

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase-js solo tipa public */

type SocioLite = { id: string; nombre: string; familia: string | null; porcentaje: number };
type DocOption = {
  id: string;
  titulo: string | null;
  fecha_emision: string | null;
  archivo_url: string | null;
};

const inputCls =
  'w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]';

const ESTADO_TONE: Record<ActaEstado, 'neutral' | 'info' | 'success'> = {
  borrador: 'neutral',
  firmada: 'info',
  protocolizada: 'success',
};
const RESULTADO_TONE: Record<ResultadoAcuerdo, 'success' | 'danger' | 'warning'> = {
  aprobado: 'success',
  rechazado: 'danger',
  aplazado: 'warning',
};

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

async function openDoc(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  archivoUrl: string | null
) {
  if (!archivoUrl) return;
  if (archivoUrl.startsWith('http')) return void window.open(archivoUrl, '_blank');
  const bucket = archivoUrl.split('/')[0];
  const path = archivoUrl.split('/').slice(1).join('/');
  const isAdjuntos = !['branding', 'logos'].includes(bucket);
  const { data, error } = await supabase.storage
    .from(isAdjuntos ? 'adjuntos' : bucket)
    .createSignedUrl(isAdjuntos ? archivoUrl : path, 3600);
  if (error || !data?.signedUrl)
    return void alert(`Error al generar enlace: ${error?.message ?? '?'}`);
  window.open(data.signedUrl, '_blank');
}

// ─── Form de header del acta (alta/edición) ───────────────────────────────────

type ActaForm = {
  folio: string;
  tipo: ActaTipo;
  fecha: string;
  lugar: string;
  asunto: string;
  quorum_pct: string;
  orden_dia: string;
  estado: ActaEstado;
  protocolizada: boolean;
  numero_escritura: string;
  notario: string;
  fecha_protocolizacion: string;
  registro_publico: string;
  documento_id: string;
  notas: string;
};

function actaToForm(a: Acta | null): ActaForm {
  return {
    folio: a?.folio ?? '',
    tipo: a?.tipo ?? 'ordinaria',
    fecha: a?.fecha ?? '',
    lugar: a?.lugar ?? '',
    asunto: a?.asunto ?? '',
    quorum_pct: a?.quorum_pct != null ? String(a.quorum_pct) : '',
    orden_dia: (a?.orden_dia ?? []).join('\n'),
    estado: a?.estado ?? 'borrador',
    protocolizada: a?.protocolizada ?? false,
    numero_escritura: a?.numero_escritura ?? '',
    notario: a?.notario ?? '',
    fecha_protocolizacion: a?.fecha_protocolizacion ?? '',
    registro_publico: a?.registro_publico ?? '',
    documento_id: a?.documento_id ?? '',
    notas: a?.notas ?? '',
  };
}

function ActaFormDrawer({
  empresaId,
  acta,
  docs,
  open,
  onOpenChange,
  onSaved,
}: {
  empresaId: string;
  acta: Acta | null;
  docs: DocOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [form, setForm] = useState<ActaForm>(() => actaToForm(acta));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof ActaForm>(k: K, v: ActaForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.fecha) {
      setErr('La fecha del acta es obligatoria.');
      return;
    }
    setSaving(true);
    setErr(null);
    const q = Number(form.quorum_pct);
    const payload = {
      folio: form.folio.trim() || null,
      tipo: form.tipo,
      fecha: form.fecha,
      lugar: form.lugar.trim() || null,
      asunto: form.asunto.trim() || null,
      quorum_pct: form.quorum_pct.trim() === '' || !Number.isFinite(q) ? null : q,
      orden_dia: parseOrdenDia(form.orden_dia),
      estado: form.estado,
      protocolizada: form.protocolizada,
      numero_escritura: form.numero_escritura.trim() || null,
      notario: form.notario.trim() || null,
      fecha_protocolizacion: form.fecha_protocolizacion || null,
      registro_publico: form.registro_publico.trim() || null,
      documento_id: form.documento_id || null,
      notas: form.notas.trim() || null,
    };
    const table = (supabase.schema('core') as any).from('gobierno_actas');
    const res = acta
      ? await table
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', acta.id)
          .select('id')
          .single()
      : await table
          .insert({ ...payload, empresa_id: empresaId })
          .select('id')
          .single();
    setSaving(false);
    if (res.error) {
      setErr(getSupabaseErrorMessage(res.error, 'No se pudo guardar el acta.'));
      return;
    }
    onSaved(res.data.id as string);
    onOpenChange(false);
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => !v && !saving && onOpenChange(false)}
      size="md"
      title={acta ? `Editar acta ${acta.folio ?? ''}`.trim() : 'Nueva acta'}
      description="Metadata del acta + protocolización notarial. Los acuerdos y asistentes se capturan en el detalle."
    >
      <DetailDrawerContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel>Folio</FieldLabel>
              <Input
                value={form.folio}
                onChange={(e) => set('folio', e.target.value)}
                placeholder="32"
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Tipo</FieldLabel>
              <select
                value={form.tipo}
                onChange={(e) => set('tipo', e.target.value as ActaTipo)}
                className={inputCls}
              >
                {(Object.keys(ACTA_TIPO_LABELS) as ActaTipo[]).map((t) => (
                  <option key={t} value={t}>
                    {ACTA_TIPO_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <FieldLabel>Fecha *</FieldLabel>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Estado</FieldLabel>
              <select
                value={form.estado}
                onChange={(e) => set('estado', e.target.value as ActaEstado)}
                className={inputCls}
              >
                {(Object.keys(ACTA_ESTADO_LABELS) as ActaEstado[]).map((s) => (
                  <option key={s} value={s}>
                    {ACTA_ESTADO_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel>Asunto</FieldLabel>
            <Input
              value={form.asunto}
              onChange={(e) => set('asunto', e.target.value)}
              placeholder="Ampliación del Consejo de Administración"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldLabel>Lugar</FieldLabel>
              <Input value={form.lugar} onChange={(e) => set('lugar', e.target.value)} />
            </div>
            <div className="space-y-1">
              <FieldLabel>Quórum % (representado)</FieldLabel>
              <Input
                type="number"
                step="0.01"
                value={form.quorum_pct}
                onChange={(e) => set('quorum_pct', e.target.value)}
                className="font-mono"
                placeholder="100"
              />
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel>Orden del día (un punto por línea)</FieldLabel>
            <textarea
              value={form.orden_dia}
              onChange={(e) => set('orden_dia', e.target.value)}
              rows={4}
              className={inputCls}
              placeholder={'1. Lista de asistencia\n2. ...'}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>PDF del acta (de Documentos)</FieldLabel>
            <select
              value={form.documento_id}
              onChange={(e) => set('documento_id', e.target.value)}
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

          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={form.protocolizada}
              onChange={(e) => set('protocolizada', e.target.checked)}
              className="h-4 w-4"
            />
            Protocolizada ante notario
          </label>
          {form.protocolizada && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/20 p-3">
              <div className="space-y-1">
                <FieldLabel>Número de escritura</FieldLabel>
                <Input
                  value={form.numero_escritura}
                  onChange={(e) => set('numero_escritura', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Notario</FieldLabel>
                <Input value={form.notario} onChange={(e) => set('notario', e.target.value)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Fecha protocolización</FieldLabel>
                <Input
                  type="date"
                  value={form.fecha_protocolizacion}
                  onChange={(e) => set('fecha_protocolizacion', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <FieldLabel>Registro público</FieldLabel>
                <Input
                  value={form.registro_publico}
                  onChange={(e) => set('registro_publico', e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <FieldLabel>Notas</FieldLabel>
            <textarea
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>

          {err && <ErrorBanner msg={err} onClose={() => setErr(null)} />}
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar acta
            </Button>
          </div>
        </div>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

// ─── Acuerdos + votos por socio ────────────────────────────────────────────────

function AcuerdosSection({ acta, socios }: { acta: Acta; socios: SocioLite[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [votos, setVotos] = useState<Voto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [nuevoPunto, setNuevoPunto] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [acRes, voRes] = await Promise.all([
      (supabase.schema('core') as any)
        .from('gobierno_acta_acuerdos')
        .select('id, acta_id, empresa_id, orden, punto, resultado, notas')
        .eq('acta_id', acta.id)
        .order('orden', { ascending: true }),
      (supabase.schema('core') as any)
        .from('gobierno_acta_votos')
        .select('id, acuerdo_id, empresa_id, socio_id, sentido, representado_por')
        .eq('empresa_id', acta.empresa_id),
    ]);
    if (acRes.error)
      setErr(getSupabaseErrorMessage(acRes.error, 'No se pudieron cargar los acuerdos.'));
    else setAcuerdos((acRes.data ?? []) as Acuerdo[]);
    setVotos((voRes.data ?? []) as Voto[]);
  }, [supabase, acta.id, acta.empresa_id]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const votosByAcuerdo = useMemo(() => {
    const m = new Map<string, Voto[]>();
    for (const v of votos) {
      const arr = m.get(v.acuerdo_id) ?? [];
      arr.push(v);
      m.set(v.acuerdo_id, arr);
    }
    return m;
  }, [votos]);

  const addAcuerdo = async () => {
    if (!nuevoPunto.trim()) return;
    setBusy(true);
    const { error } = await (supabase.schema('core') as any).from('gobierno_acta_acuerdos').insert({
      acta_id: acta.id,
      empresa_id: acta.empresa_id,
      orden: acuerdos.length + 1,
      punto: nuevoPunto.trim(),
      resultado: 'aprobado',
    });
    setBusy(false);
    if (error) return setErr(getSupabaseErrorMessage(error, 'No se pudo agregar el acuerdo.'));
    setNuevoPunto('');
    await load();
  };

  const updateAcuerdo = async (
    id: string,
    patch: Partial<Pick<Acuerdo, 'punto' | 'resultado'>>
  ) => {
    const { error } = await (supabase.schema('core') as any)
      .from('gobierno_acta_acuerdos')
      .update(patch)
      .eq('id', id);
    if (error) setErr(getSupabaseErrorMessage(error, 'No se pudo actualizar.'));
    else await load();
  };

  const delAcuerdo = async (a: Acuerdo) => {
    if (!confirm(`¿Eliminar el acuerdo "${a.punto}"? Se borran también sus votos.`)) return;
    const { error } = await (supabase.schema('core') as any)
      .from('gobierno_acta_acuerdos')
      .delete()
      .eq('id', a.id);
    if (error) setErr(getSupabaseErrorMessage(error, 'No se pudo eliminar.'));
    else await load();
  };

  // Voto por (acuerdo, socio): set → upsert; "" → delete.
  const setVoto = async (acuerdoId: string, socioId: string, sentido: '' | Sentido) => {
    const existing = (votosByAcuerdo.get(acuerdoId) ?? []).find((v) => v.socio_id === socioId);
    if (sentido === '') {
      if (!existing) return;
      const { error } = await (supabase.schema('core') as any)
        .from('gobierno_acta_votos')
        .delete()
        .eq('id', existing.id);
      if (error) return setErr(getSupabaseErrorMessage(error, 'No se pudo quitar el voto.'));
    } else {
      const { error } = await (supabase.schema('core') as any).from('gobierno_acta_votos').upsert(
        {
          acuerdo_id: acuerdoId,
          empresa_id: acta.empresa_id,
          socio_id: socioId,
          sentido,
        },
        { onConflict: 'acuerdo_id,socio_id' }
      );
      if (error) return setErr(getSupabaseErrorMessage(error, 'No se pudo registrar el voto.'));
    }
    await load();
  };

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Cargando acuerdos…</p>;

  return (
    <div className="space-y-3">
      {err && <ErrorBanner msg={err} onClose={() => setErr(null)} />}
      {acuerdos.length === 0 && (
        <p className="text-sm text-[var(--text)]/40">Sin acuerdos registrados.</p>
      )}
      {acuerdos.map((a) => {
        const tally = tallyVotos(votosByAcuerdo.get(a.id) ?? []);
        return (
          <div
            key={a.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/20 p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <span className="mt-1 text-xs tabular-nums text-[var(--text)]/40">{a.orden}.</span>
              <textarea
                defaultValue={a.punto}
                onBlur={(e) =>
                  e.target.value.trim() !== a.punto &&
                  void updateAcuerdo(a.id, { punto: e.target.value.trim() })
                }
                rows={2}
                className={`${inputCls} flex-1`}
              />
              <select
                value={a.resultado}
                onChange={(e) =>
                  void updateAcuerdo(a.id, { resultado: e.target.value as ResultadoAcuerdo })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--text)]"
              >
                {RESULTADOS.map((r) => (
                  <option key={r} value={r}>
                    {RESULTADO_LABELS[r]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void delAcuerdo(a)}
                className="h-7 px-2 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Badge tone={RESULTADO_TONE[a.resultado]}>{RESULTADO_LABELS[a.resultado]}</Badge>
              <span className="text-xs text-[var(--text)]/50">{tallyLabel(tally)}</span>
            </div>
            {socios.length > 0 && (
              <div className="grid grid-cols-1 gap-1.5 pl-6 sm:grid-cols-2 lg:grid-cols-3">
                {socios.map((s) => {
                  const v = (votosByAcuerdo.get(a.id) ?? []).find((x) => x.socio_id === s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-[var(--text)]/70" title={s.nombre}>
                        {s.familia || s.nombre}
                      </span>
                      <select
                        value={v?.sentido ?? ''}
                        onChange={(e) => void setVoto(a.id, s.id, e.target.value as '' | Sentido)}
                        className="rounded border border-[var(--border)] bg-[var(--panel)] px-1.5 py-1 text-xs text-[var(--text)]"
                      >
                        <option value="">—</option>
                        {SENTIDOS.map((sd) => (
                          <option key={sd} value={sd}>
                            {SENTIDO_LABELS[sd]}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Input
          value={nuevoPunto}
          onChange={(e) => setNuevoPunto(e.target.value)}
          placeholder="Texto del nuevo acuerdo…"
          onKeyDown={(e) => e.key === 'Enter' && void addAcuerdo()}
        />
        <Button
          size="sm"
          onClick={() => void addAcuerdo()}
          disabled={busy || !nuevoPunto.trim()}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" /> Acuerdo
        </Button>
      </div>
    </div>
  );
}

// ─── Asistentes / quórum ───────────────────────────────────────────────────────

function AsistentesSection({ acta, socios }: { acta: Acta; socios: SocioLite[] }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [asistentes, setAsistentes] = useState<Asistente[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase.schema('core') as any)
      .from('gobierno_acta_asistentes')
      .select('id, acta_id, empresa_id, socio_id, presente, representado_por, porcentaje')
      .eq('acta_id', acta.id);
    if (error) setErr(getSupabaseErrorMessage(error, 'No se pudieron cargar los asistentes.'));
    else setAsistentes((data ?? []) as Asistente[]);
  }, [supabase, acta.id]);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const bySocio = useMemo(() => new Map(asistentes.map((a) => [a.socio_id, a])), [asistentes]);
  const pctMap = useMemo(() => new Map(socios.map((s) => [s.id, s.porcentaje])), [socios]);
  const quorum = useMemo(() => quorumDerivado(asistentes, pctMap), [asistentes, pctMap]);

  const setAsistente = async (
    socioId: string,
    patch: Partial<Pick<Asistente, 'presente' | 'representado_por' | 'porcentaje'>>
  ) => {
    const existing = bySocio.get(socioId);
    const base = {
      acta_id: acta.id,
      empresa_id: acta.empresa_id,
      socio_id: socioId,
      presente: existing?.presente ?? true,
      representado_por: existing?.representado_por ?? null,
      porcentaje: existing?.porcentaje ?? pctMap.get(socioId) ?? null,
    };
    const { error } = await (supabase.schema('core') as any)
      .from('gobierno_acta_asistentes')
      .upsert({ ...base, ...patch }, { onConflict: 'acta_id,socio_id' });
    if (error) setErr(getSupabaseErrorMessage(error, 'No se pudo guardar la asistencia.'));
    else await load();
  };

  if (loading) return <p className="text-sm text-[var(--text-muted)]">Cargando asistentes…</p>;

  return (
    <div className="space-y-2">
      {err && <ErrorBanner msg={err} onClose={() => setErr(null)} />}
      {socios.length === 0 ? (
        <p className="text-sm text-[var(--text)]/40">
          Captura primero el cuadro accionario para registrar asistencia y quórum.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Quórum derivado (presentes):</span>
            <Badge
              tone={Math.abs(quorum - 100) <= 0.01 ? 'success' : quorum > 0 ? 'warning' : 'neutral'}
            >
              {quorum.toFixed(quorum % 1 === 0 ? 0 : 2)}%
            </Badge>
          </div>
          <div className="space-y-1.5">
            {socios.map((s) => {
              const a = bySocio.get(s.id);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)]/20 px-2 py-1.5"
                >
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={a?.presente ?? false}
                      onChange={(e) => void setAsistente(s.id, { presente: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </label>
                  <span
                    className="min-w-[120px] flex-1 text-sm text-[var(--text)]"
                    title={s.nombre}
                  >
                    {s.familia || s.nombre}
                  </span>
                  <Input
                    defaultValue={a?.representado_por ?? ''}
                    onBlur={(e) =>
                      (e.target.value.trim() || null) !== (a?.representado_por ?? null) &&
                      void setAsistente(s.id, { representado_por: e.target.value.trim() || null })
                    }
                    placeholder="Representado por…"
                    className="h-8 w-44 text-xs"
                  />
                  <span className="w-16 text-right font-mono text-xs tabular-nums text-[var(--text)]/60">
                    {(a?.porcentaje ?? s.porcentaje).toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Detalle del acta ──────────────────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h5 className="border-b border-[var(--border)] pb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/60">
        {title}
      </h5>
      {children}
    </div>
  );
}

function ActaDetailDrawer({
  acta,
  socios,
  docs,
  open,
  onOpenChange,
  onEdit,
}: {
  acta: Acta | null;
  socios: SocioLite[];
  docs: DocOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  // El PDF se deriva del catálogo de docs que ya trae el panel (sin fetch extra).
  const doc = useMemo(
    () => docs.find((d) => d.id === acta?.documento_id) ?? null,
    [docs, acta?.documento_id]
  );

  if (!acta) return null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Acta ${acta.folio ?? ''} — ${ACTA_TIPO_LABELS[acta.tipo]}`.replace('  ', ' ')}
      description={acta.asunto ?? undefined}
      actions={
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
          Editar
        </Button>
      }
    >
      <DetailDrawerContent>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ESTADO_TONE[acta.estado]}>{ACTA_ESTADO_LABELS[acta.estado]}</Badge>
            <span className="text-sm text-[var(--text)]/70">{acta.fecha}</span>
            {acta.quorum_pct != null && (
              <span className="text-sm text-[var(--text)]/50">· Quórum {acta.quorum_pct}%</span>
            )}
            {acta.protocolizada && <Badge tone="success">Protocolizada</Badge>}
            {doc?.archivo_url && (
              <button
                type="button"
                onClick={() => void openDoc(supabase, doc.archivo_url)}
                className="ml-auto inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
              >
                Ver PDF <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>

          {acta.orden_dia && acta.orden_dia.length > 0 && (
            <DetailSection title="Orden del día">
              <ol className="space-y-1 text-sm text-[var(--text)]/80">
                {acta.orden_dia.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </DetailSection>
          )}

          <DetailSection title="Acuerdos y votación">
            <AcuerdosSection acta={acta} socios={socios} />
          </DetailSection>

          <DetailSection title="Asistentes y quórum">
            <AsistentesSection acta={acta} socios={socios} />
          </DetailSection>

          {acta.protocolizada && (
            <DetailSection title="Protocolización notarial">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Meta label="Escritura" value={acta.numero_escritura} />
                <Meta label="Notario" value={acta.notario} />
                <Meta label="Fecha" value={acta.fecha_protocolizacion} />
                <Meta label="Registro público" value={acta.registro_publico} />
              </dl>
            </DetailSection>
          )}

          {acta.notas && (
            <DetailSection title="Notas">
              <p className="text-sm text-[var(--text)]/70">{acta.notas}</p>
            </DetailSection>
          )}
        </div>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--text)]/40">{label}</dt>
      <dd className="text-[var(--text)]/80">{value || '—'}</dd>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function ActasAsambleaPanel({ empresaId }: { empresaId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [actas, setActas] = useState<Acta[]>([]);
  const [socios, setSocios] = useState<SocioLite[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingActa, setEditingActa] = useState<Acta | null>(null);
  // Incrementa en cada apertura → `key` del form drawer → remonta con estado
  // fresco (evita sincronizar el form en un effect, que dispara el lint
  // react-hooks/set-state-in-effect).
  const [formSeq, setFormSeq] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);

  const openForm = (acta: Acta | null) => {
    setEditingActa(acta);
    setFormSeq((s) => s + 1);
    setFormOpen(true);
  };

  const load = useCallback(async () => {
    const [actasRes, sociosRes, docsRes] = await Promise.all([
      (supabase.schema('core') as any)
        .from('gobierno_actas')
        .select(
          'id, empresa_id, folio, tipo, fecha, lugar, asunto, quorum_pct, orden_dia, protocolizada, numero_escritura, notario, fecha_protocolizacion, registro_publico, documento_id, estado, notas'
        )
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false }),
      (supabase.schema('core') as any)
        .from('empresa_socios')
        .select('id, nombre, familia, porcentaje')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('orden', { ascending: true }),
      (supabase.schema('erp') as any)
        .from('documentos')
        .select('id, titulo, fecha_emision, archivo_url')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .order('fecha_emision', { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    if (actasRes.error)
      setError(getSupabaseErrorMessage(actasRes.error, 'No se pudieron cargar las actas.'));
    else setActas((actasRes.data ?? []) as Acta[]);
    setSocios((sociosRes.data ?? []) as SocioLite[]);
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

  const detailActa = useMemo(() => actas.find((a) => a.id === detailId) ?? null, [actas, detailId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)]/30 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text)]/40" />
        <span className="text-sm text-[var(--text-muted)]">Cargando actas…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--text)]/80">
          Actas de asamblea
        </h4>
        <Button size="sm" onClick={() => openForm(null)} className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" /> Nueva acta
        </Button>
      </div>

      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {actas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/20 p-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">Sin actas capturadas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--panel)]">
                {['Folio', 'Tipo', 'Fecha', 'Asunto', 'Estado', ''].map((h, i) => (
                  <th
                    key={h || `act-${i}`}
                    className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actas.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setDetailId(a.id)}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--panel)]/40"
                >
                  <td className="px-3 py-2 font-mono text-[var(--text)]/70">{a.folio ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={a.tipo === 'extraordinaria' ? 'warning' : 'neutral'}>
                      {ACTA_TIPO_LABELS[a.tipo]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text)]/70 whitespace-nowrap">
                    {a.fecha}
                  </td>
                  <td className="px-3 py-2 text-[var(--text)]">{a.asunto ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Badge tone={ESTADO_TONE[a.estado]}>{ACTA_ESTADO_LABELS[a.estado]}</Badge>
                      {a.protocolizada && <Badge tone="success">Prot.</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--text)]/30">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ActaFormDrawer
        key={formSeq}
        empresaId={empresaId}
        acta={editingActa}
        docs={docs}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(id) => {
          void load();
          setDetailId(id);
        }}
      />

      <ActaDetailDrawer
        acta={detailActa}
        socios={socios}
        docs={docs}
        open={detailId !== null}
        onOpenChange={(v) => !v && setDetailId(null)}
        onEdit={() => {
          if (detailActa) {
            setDetailId(null);
            openForm(detailActa);
          }
        }}
      />
    </div>
  );
}
