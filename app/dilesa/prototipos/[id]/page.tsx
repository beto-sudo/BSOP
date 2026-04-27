'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: setLoading/setError before firing async fetch; misma
 * convención que juntas/[id], tasks detail y terrenos/[id].
 */

/**
 * Detalle de un prototipo.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-prototipos).
 *
 * Layout:
 *   - Columna izquierda (2/3 desktop): ficha técnica por secciones
 *     (Identidad → Dimensiones → Económica → Gestión).
 *   - Columna derecha (1/3 desktop): imagen principal, plano, panel de
 *     costos unitarios detallado (6 líneas + total + margen con %).
 *
 * Schema: supabase/SCHEMA_REF.md §dilesa.prototipos.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Archive, Loader2, ExternalLink, ImageOff } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DetailPage, DetailHeader } from '@/components/detail-page';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
  formatPercent,
} from '@/lib/dilesa-constants';
import {
  PROTOTIPO_ETAPA_CONFIG,
  PRIORIDAD_CONFIG,
  type PrototipoEtapa,
  type PrioridadNivel,
} from '@/lib/status-tokens';

type PrototipoFull = {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  clasificacion_inmobiliaria_id: string | null;
  clasificacion_inmobiliaria: { nombre: string; codigo: string | null } | null;
  superficie_construida_m2: number | null;
  superficie_lote_min_m2: number | null;
  recamaras: number | null;
  banos: number | null;
  valor_comercial: number | null;
  costo_urbanizacion: number | null;
  costo_materiales: number | null;
  costo_mano_obra: number | null;
  costo_registro_ruv: number | null;
  seguro_calidad: number | null;
  costo_comercializacion: number | null;
  costo_total_unitario: number | null;
  plano_arquitectonico_url: string | null;
  imagen_principal_url: string | null;
  notas: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  created_at: string;
  updated_at: string;
};

function PrototipoDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [prototipo, setPrototipo] = useState<PrototipoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .select('*, clasificacion_inmobiliaria(nombre, codigo)')
      .eq('id', id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setPrototipo(null);
      return;
    }
    setPrototipo((data as unknown as PrototipoFull | null) ?? null);
  }, [supabase, id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await load();
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const feedback = useActionFeedback();

  const handleArchive = async () => {
    if (!prototipo) return;
    setArchiving(true);
    const { error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', prototipo.id);
    setArchiving(false);
    if (err) {
      feedback.error(err, { title: 'No se pudo archivar el prototipo' });
      return;
    }
    feedback.success('Prototipo archivado');
    router.push('/dilesa/prototipos');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !prototipo) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dilesa/prototipos')}>
          <ArrowLeft className="size-4" />
          Volver a Prototipos
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error ?? 'No se encontró el prototipo o fue archivado.'}
        </div>
      </div>
    );
  }

  const margen =
    prototipo.valor_comercial != null && prototipo.costo_total_unitario != null
      ? prototipo.valor_comercial - prototipo.costo_total_unitario
      : null;
  const margenPct =
    margen != null && prototipo.valor_comercial && prototipo.valor_comercial > 0
      ? margen / prototipo.valor_comercial
      : null;

  return (
    <DetailPage>
      <DetailHeader
        back={{ onClick: () => router.push('/dilesa/prototipos'), label: 'Volver a Prototipos' }}
        eyebrow="DILESA · Prototipo"
        title={prototipo.nombre}
        subtitle={prototipo.codigo ?? undefined}
        meta={<EtapaBadgeLarge etapa={prototipo.etapa} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveOpen(true)}
            disabled={archiving}
            className="text-red-400"
          >
            {archiving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Archive className="size-4" />
            )}
            Archivar
          </Button>
        }
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={handleArchive}
        title={`¿Archivar el prototipo "${prototipo.nombre}"?`}
        description="No se elimina de la base de datos; se puede restaurar quitando deleted_at por SQL."
        confirmLabel="Archivar"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="A. Identidad">
            <Field label="Nombre">{prototipo.nombre}</Field>
            <Field label="Código">{prototipo.codigo ?? '—'}</Field>
            <Field label="Clasificación" wide>
              {prototipo.clasificacion_inmobiliaria?.nombre ?? (
                <span className="text-[var(--text)]/40">(sin clasificar)</span>
              )}
              {prototipo.clasificacion_inmobiliaria?.codigo ? (
                <span className="ml-2 font-mono text-xs text-[var(--text)]/45">
                  {prototipo.clasificacion_inmobiliaria.codigo}
                </span>
              ) : null}
            </Field>
          </Section>

          <Section title="B. Dimensiones">
            <Field label="Superficie construida">
              {formatM2(prototipo.superficie_construida_m2)}
            </Field>
            <Field label="Lote mínimo">{formatM2(prototipo.superficie_lote_min_m2)}</Field>
            <Field label="Recámaras">{prototipo.recamaras ?? '—'}</Field>
            <Field label="Baños">{prototipo.banos ?? '—'}</Field>
          </Section>

          <Section title="C. Económica">
            <Field label="Valor comercial">{formatCurrency(prototipo.valor_comercial)}</Field>
            <Field label="Costo total unitario">
              {formatCurrency(prototipo.costo_total_unitario)}
              <span className="ml-1 text-[10px] text-[var(--text)]/40">(calculado)</span>
            </Field>
            <Field label="Margen unitario">
              {margen != null ? (
                <span className={margen < 0 ? 'font-semibold text-red-400' : ''}>
                  {formatCurrency(margen)}
                </span>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Margen %">
              {margenPct != null ? (
                <span className={margenPct < 0 ? 'font-semibold text-red-400' : ''}>
                  {formatPercent(margenPct)}
                </span>
              ) : (
                '—'
              )}
            </Field>
          </Section>

          <Section title="D. Gestión">
            <Field label="Etapa">
              {prototipo.etapa
                ? (PROTOTIPO_ETAPA_CONFIG[prototipo.etapa as PrototipoEtapa]?.label ??
                  prototipo.etapa)
                : '—'}
            </Field>
            <Field label="Prioridad">
              {prototipo.prioridad
                ? (PRIORIDAD_CONFIG[prototipo.prioridad as PrioridadNivel]?.label ??
                  prototipo.prioridad)
                : '—'}
            </Field>
            <Field label="Decisión actual">{prototipo.decision_actual ?? '—'}</Field>
            <Field label="Responsable">
              {prototipo.responsable_id ? (
                <span className="font-mono text-xs text-[var(--text)]/60">
                  {prototipo.responsable_id.slice(0, 8)}…
                </span>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Última revisión">
              {formatDateShort(prototipo.fecha_ultima_revision)}
            </Field>
            <Field label="Fecha captura">{formatDateShort(prototipo.created_at)}</Field>
            <Field label="Siguiente acción" wide>
              {prototipo.siguiente_accion ?? '—'}
            </Field>
          </Section>

          <Section title="E. Documentos">
            <Field label="Plano arquitectónico" wide>
              {prototipo.plano_arquitectonico_url ? (
                <a
                  href={prototipo.plano_arquitectonico_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir plano
                </a>
              ) : (
                <span className="text-[var(--text)]/40">—</span>
              )}
            </Field>
            {prototipo.notas ? (
              <div className="col-span-full pt-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/45">
                  Notas
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]/75">
                  {prototipo.notas}
                </p>
              </div>
            ) : null}
          </Section>
        </div>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {prototipo.imagen_principal_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={prototipo.imagen_principal_url}
                alt={`Imagen principal de ${prototipo.nombre}`}
                className="h-56 w-full object-cover"
              />
            ) : (
              <div className="flex h-56 w-full items-center justify-center gap-2 bg-[var(--border)]/30 text-sm text-[var(--text)]/40">
                <ImageOff className="size-4" />
                Sin imagen principal
              </div>
            )}
          </section>

          <Section title="Costos unitarios">
            <CostRow label="Urbanización" value={prototipo.costo_urbanizacion} />
            <CostRow label="Materiales" value={prototipo.costo_materiales} />
            <CostRow label="Mano de obra" value={prototipo.costo_mano_obra} />
            <CostRow label="Registro RUV" value={prototipo.costo_registro_ruv} />
            <CostRow label="Seguro de calidad" value={prototipo.seguro_calidad} />
            <CostRow label="Comercialización" value={prototipo.costo_comercializacion} />
            <div className="col-span-full mt-2 border-t border-[var(--border)] pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text)]/55">Costo total</span>
                <span className="font-semibold tabular-nums text-[var(--text)]">
                  {formatCurrency(prototipo.costo_total_unitario)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-[var(--text)]/55">Valor comercial</span>
                <span className="tabular-nums text-[var(--text)]">
                  {formatCurrency(prototipo.valor_comercial)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-[var(--text)]/55">Margen unitario</span>
                <span
                  className={`tabular-nums ${
                    margen != null && margen < 0
                      ? 'font-semibold text-red-400'
                      : 'text-[var(--text)]'
                  }`}
                >
                  {margen != null ? formatCurrency(margen) : '—'}
                  {margenPct != null ? (
                    <span className="ml-1 text-xs text-[var(--text)]/45">
                      ({formatPercent(margenPct)})
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </DetailPage>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
        {title}
      </h2>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-full' : undefined}>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[var(--text)]/85">{children}</dd>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="col-span-full flex items-center justify-between text-sm">
      <span className="text-[var(--text)]/65">{label}</span>
      <span className="tabular-nums text-[var(--text)]/85">{formatCurrency(value)}</span>
    </div>
  );
}

function EtapaBadgeLarge({ etapa }: { etapa: string | null }) {
  if (!etapa) return null;
  const cfg = PROTOTIPO_ETAPA_CONFIG[etapa as PrototipoEtapa];
  if (!cfg) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)]/65">
        {etapa}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export default function PrototipoDetailPage() {
  return (
    <RequireAccess empresa="dilesa">
      <PrototipoDetailInner />
    </RequireAccess>
  );
}
