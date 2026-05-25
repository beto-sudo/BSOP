'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de forms (cf. ventas/nueva, contratos/nuevo).
 */

/**
 * Form: Generar estimación borrador (DILESA).
 *
 * Iniciativa dilesa-estimaciones · Sprint 4.
 *
 * Flujo:
 *   1. Selecciona contratista (solo los activos con tareas pendientes).
 *   2. Selecciona fecha de cierre (default = hoy, convencionalmente
 *      miércoles).
 *   3. (Opcional) Ajusta retención % (default 5%).
 *   4. Preview en vivo de las tareas pendientes que se incluirán
 *      (cuántas + monto bruto total) — query a v_tareas_pendientes_de_pago.
 *   5. Submit → llama RPC fn_generar_estimacion_borrador → redirige al
 *      detalle de la nueva estimación.
 *
 * No hay "des-seleccionar" tareas en este Sprint — la estimación se
 * genera con TODAS las pendientes del contratista hasta la fecha de
 * cierre. Si el operador quiere granularidad fina, puede cancelar el
 * borrador y volver a generar con fecha distinta. v2 podría permitir
 * quitar tareas individuales.
 *
 * Acceso: sub-slug `dilesa.construccion.estimaciones` (creado en Sprint 2).
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Banknote, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type ContratistaOpt = {
  id: string;
  nombre: string;
  abreviacion: string | null;
  tareasPendientes: number;
  montoPendiente: number;
};

type PreviewStats = {
  tareas: number;
  montoBruto: number;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number) => moneyFmt.format(n);

export default function NuevaEstimacionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.estimaciones" write>
      {/* Suspense por useSearchParams (Next.js 16 + Turbopack). */}
      <Suspense fallback={null}>
        <NuevaEstimacionForm />
      </Suspense>
    </RequireAccess>
  );
}

function NuevaEstimacionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  // ── Catálogo: contratistas con tareas pendientes ────────────────────
  const [contratistas, setContratistas] = useState<ContratistaOpt[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Form ────────────────────────────────────────────────────────────
  const [contratistaId, setContratistaId] = useState<string>('');
  const [fechaCierre, setFechaCierre] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [retencionPct, setRetencionPct] = useState<string>('5');

  // ── Preview ─────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewStats | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setLoadError(null);

    // 1. Tareas pendientes agregadas por contratista (vía vista SQL).
    const { data: pendRes, error: pendErr } = await sb
      .schema('dilesa')
      .from('v_tareas_pendientes_de_pago')
      .select('contratista_id, monto_calculado')
      .eq('empresa_id', DILESA_EMPRESA_ID);
    if (pendErr) {
      setLoadError(
        getSupabaseErrorMessage(pendErr, 'No se pudieron cargar las tareas pendientes.')
      );
      setLoadingMeta(false);
      return;
    }

    const agregado = new Map<string, { tareas: number; monto: number }>();
    for (const row of pendRes ?? []) {
      const cid = row.contratista_id as string;
      const cur = agregado.get(cid) ?? { tareas: 0, monto: 0 };
      cur.tareas += 1;
      cur.monto += Number(row.monto_calculado ?? 0);
      agregado.set(cid, cur);
    }

    if (agregado.size === 0) {
      setContratistas([]);
      setLoadingMeta(false);
      return;
    }

    // 2. Lookup de nombres + abrev sólo para los contratistas con pendientes.
    const cIds = [...agregado.keys()];
    const [persRes, datosRes] = await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .in('id', cIds),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .in('persona_id', cIds)
        .is('deleted_at', null),
    ]);

    const firstErr = persRes.error ?? datosRes.error;
    if (firstErr) {
      setLoadError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los contratistas.'));
      setLoadingMeta(false);
      return;
    }

    const persMap = new Map<string, string>();
    for (const p of persRes.data ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      persMap.set(p.id as string, nombre || '(sin nombre)');
    }
    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }

    const opts: ContratistaOpt[] = [...agregado.entries()]
      .map(([id, agg]) => ({
        id,
        nombre: persMap.get(id) ?? '(sin contratista)',
        abreviacion: abrevMap.get(id) ?? null,
        tareasPendientes: agg.tareas,
        montoPendiente: agg.monto,
      }))
      .sort((a, b) => b.montoPendiente - a.montoPendiente);

    setContratistas(opts);
    setLoadingMeta(false);
  }, [sb]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  // Deep link ?contratista=
  useEffect(() => {
    const cid = searchParams.get('contratista');
    if (cid && contratistas.find((c) => c.id === cid) && !contratistaId) {
      setContratistaId(cid);
    }
  }, [searchParams, contratistas, contratistaId]);

  // Preview de lo que se va a incluir cuando cambian contratista o fecha.
  useEffect(() => {
    if (!contratistaId || !fechaCierre) {
      setPreview(null);
      return;
    }
    let activo = true;
    setPreviewing(true);
    (async () => {
      const { data, error } = await sb
        .schema('dilesa')
        .from('v_tareas_pendientes_de_pago')
        .select('monto_calculado')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('contratista_id', contratistaId)
        .lte('fecha_terminada', fechaCierre);
      if (!activo) return;
      if (error || !data) {
        setPreview({ tareas: 0, montoBruto: 0 });
      } else {
        let monto = 0;
        for (const r of data) monto += Number(r.monto_calculado ?? 0);
        setPreview({ tareas: data.length, montoBruto: monto });
      }
      setPreviewing(false);
    })();
    return () => {
      activo = false;
    };
  }, [sb, contratistaId, fechaCierre]);

  const contratistaSel = useMemo(
    () => contratistas.find((c) => c.id === contratistaId) ?? null,
    [contratistas, contratistaId]
  );

  const retencionNum = Number(retencionPct) || 0;
  const retencionValida = retencionNum >= 0 && retencionNum <= 100;
  const previewNeto = preview ? preview.montoBruto * (1 - retencionNum / 100) : 0;
  const previewRetMonto = preview ? preview.montoBruto * (retencionNum / 100) : 0;

  const canSubmit =
    !!contratistaId &&
    !!fechaCierre &&
    retencionValida &&
    !!preview &&
    preview.tareas > 0 &&
    !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data, error } = await sb.schema('dilesa').rpc('fn_generar_estimacion_borrador', {
      p_contratista_id: contratistaId,
      p_fecha_cierre: fechaCierre,
      p_retencion_pct: retencionNum,
    });
    setSubmitting(false);

    if (error) {
      toast.add({
        title: 'No se pudo generar la estimación',
        description: getSupabaseErrorMessage(error, 'Error en el RPC.'),
        type: 'error',
      });
      return;
    }

    if (!data) {
      toast.add({
        title: 'Sin tareas pendientes',
        description:
          'El contratista no tiene tareas pendientes de pago en la ventana seleccionada.',
        type: 'warning',
      });
      return;
    }

    toast.add({
      title: 'Estimación generada',
      description: `Borrador con ${preview?.tareas} tarea(s) · neto ${money(previewNeto)}`,
      type: 'success',
    });
    router.push(`/dilesa/construccion/estimaciones/${data as string}`);
  }

  if (loadingMeta) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      </div>
    );
  }

  if (contratistas.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <Banknote className="mx-auto mb-3 h-8 w-8 text-[var(--text)]/40" />
          <h2 className="text-sm font-medium text-[var(--text)]">
            No hay tareas pendientes de pago
          </h2>
          <p className="mt-1 text-xs text-[var(--text)]/60">
            Para generar una estimación, los contratistas deben tener tareas terminadas (palomeadas)
            que aún no estén vinculadas a otra estimación.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <BackLink />

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Banknote className="h-5 w-5 text-[var(--accent)]" />
          Nueva estimación
        </h1>
        <p className="mt-1 text-sm text-[var(--text)]/60">
          Se genera un borrador agrupando todas las tareas pendientes del contratista hasta la fecha
          de cierre. Convención DILESA: cierre miércoles, pago jueves.
        </p>
      </header>

      <Section title="Datos de la estimación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contratista *">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={contratistaId}
              onChange={(e) => setContratistaId(e.target.value)}
            >
              <option value="">— selecciona —</option>
              {contratistas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.abreviacion ? `${c.abreviacion} · ` : ''}
                  {c.nombre} · {c.tareasPendientes} pendientes · {money(c.montoPendiente)}
                </option>
              ))}
            </select>
            <Hint>
              Solo aparecen contratistas con tareas pendientes (no vinculadas a otra estimación).
            </Hint>
          </Field>

          <Field label="Fecha de cierre *">
            <Input
              type="date"
              value={fechaCierre}
              onChange={(e) => setFechaCierre(e.target.value)}
              required
            />
            <Hint>Incluirá tareas terminadas en esta fecha o antes.</Hint>
          </Field>

          <Field label="Retención %">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={retencionPct}
              onChange={(e) => setRetencionPct(e.target.value)}
            />
            <Hint>
              {retencionValida
                ? 'Convención DILESA: 5%. Editable por excepción.'
                : 'Debe estar entre 0 y 100.'}
            </Hint>
          </Field>
        </div>
      </Section>

      {contratistaId ? (
        <Section
          title="Preview de la estimación"
          description={
            previewing
              ? 'calculando…'
              : preview
                ? `${preview.tareas} tarea(s) en la ventana seleccionada`
                : '—'
          }
        >
          {previewing ? (
            <Skeleton className="h-20 w-full rounded-md" />
          ) : preview && preview.tareas > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Tareas a incluir" value={preview.tareas.toString()} />
              <Stat label="Monto bruto" value={money(preview.montoBruto)} />
              <Stat label={`Neto (${retencionPct}% ret.)`} value={money(previewNeto)} accent />
              <Stat
                label="Retención"
                value={`${money(previewRetMonto)} (${retencionPct}%)`}
                subtle
              />
              {contratistaSel ? (
                <Stat
                  label="Total acumulado del contratista"
                  value={money(contratistaSel.montoPendiente)}
                  subtle
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              No hay tareas pendientes de este contratista en la ventana seleccionada. Cambia la
              fecha de cierre a algo más reciente o selecciona otro contratista.
            </div>
          )}
        </Section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text)]/60">
          {preview && preview.tareas > 0
            ? `Se creará una estimación en estado "borrador" — podrás revisarla y aprobarla después.`
            : 'Selecciona contratista y fecha de cierre para ver el preview.'}
        </p>
        <div className="flex items-center gap-3">
          <Link href="/dilesa/construccion/estimaciones">
            <Button variant="outline" disabled={submitting}>
              Cancelar
            </Button>
          </Link>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Generar borrador
          </Button>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dilesa/construccion/estimaciones"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
    >
      <ArrowLeft className="size-4" /> Volver a estimaciones
    </Link>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          {title}
        </h2>
        {description ? <span className="text-xs text-[var(--text)]/50">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/60">
        {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-[var(--text)]/50">{children}</p>;
}

function Stat({
  label,
  value,
  accent,
  subtle,
}: {
  label: string;
  value: string;
  accent?: boolean;
  subtle?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 ${
        accent ? 'ring-1 ring-[var(--accent)]/30' : ''
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/50">{label}</div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          subtle ? 'text-[var(--text)]/70' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
