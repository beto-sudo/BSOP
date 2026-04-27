'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: setLoading/setError before firing async fetch; same
 * convention used in juntas/[id] y tasks detail pages.
 */

/**
 * Detalle de un terreno.
 *
 * Sprint dilesa-1 UI — scaffold con secciones colapsables A→H (ver
 * /mnt/DILESA/knowledge/convencion-vistas-paginas.md §5). Esta primera
 * versión es read-only: muestra el expediente completo y permite archivar.
 * La edición inline por sección y el mapa embebido se agregan en iteración
 * siguiente — placeholders presentes.
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Archive, Loader2, MapPin, ExternalLink } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
  formatPercent,
} from '@/lib/dilesa-constants';
import {
  TERRENO_ETAPA_CONFIG,
  TERRENO_ESTATUS_PROPIEDAD_LABEL,
  PRIORIDAD_CONFIG,
  type TerrenoEtapa,
  type PrioridadNivel,
  type TerrenoEstatusPropiedad,
} from '@/lib/status-tokens';

type TerrenoFull = {
  id: string;
  empresa_id: string;
  nombre: string;
  clave_interna: string | null;
  tipo: string | null;
  area_terreno_m2: number | null;
  areas_afectacion_m2: number | null;
  areas_aprovechables_m2: number | null;
  objetivo: string | null;
  numero_escritura: string | null;
  fecha_captura: string;
  municipio: string | null;
  zona_sector: string | null;
  direccion_referencia: string | null;
  nombre_propietario: string | null;
  telefono_propietario: string | null;
  nombre_corredor: string | null;
  telefono_corredor: string | null;
  precio_solicitado_m2: number | null;
  precio_ofertado_m2: number | null;
  valor_interno_estimado: number | null;
  valor_objetivo_compra: number | null;
  valor_predio: number | null;
  valor_total_oferta: number | null;
  pct_diferencia_solicitado_oferta: number | null;
  origen: string | null;
  estatus_propiedad: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  imagen_zcu_url: string | null;
  archivo_kmz_url: string | null;
  pdf_escritura_url: string | null;
  documentos: unknown;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

function TerrenoDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [terreno, setTerreno] = useState<TerrenoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('terrenos')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setTerreno(null);
      return;
    }
    setTerreno((data as TerrenoFull | null) ?? null);
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
    if (!terreno) return;
    setArchiving(true);
    const { error: err } = await supabase
      .schema('dilesa')
      .from('terrenos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', terreno.id);
    setArchiving(false);
    if (err) {
      feedback.error(err, { title: 'No se pudo archivar el terreno' });
      return;
    }
    feedback.success('Terreno archivado');
    router.push('/dilesa/terrenos');
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

  if (error || !terreno) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dilesa/terrenos')}>
          <ArrowLeft className="size-4" />
          Volver a Terrenos
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error ?? 'No se encontró el terreno o fue archivado.'}
        </div>
      </div>
    );
  }

  const mapQuery = encodeURIComponent(
    [terreno.direccion_referencia, terreno.zona_sector, terreno.municipio]
      .filter(Boolean)
      .join(', ')
  );
  const mapSrc = mapQuery ? `https://www.google.com/maps?q=${mapQuery}&output=embed` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => router.push('/dilesa/terrenos')}
            aria-label="Volver a Terrenos"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
              DILESA · Terreno
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--text)]">
              {terreno.nombre}
            </h1>
            {terreno.clave_interna ? (
              <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-[var(--text)]/45">
                {terreno.clave_interna}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EtapaBadgeLarge etapa={terreno.etapa} />
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
        </div>
      </div>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={handleArchive}
        title={`¿Archivar el terreno "${terreno.nombre}"?`}
        description="No se elimina de la base de datos; se puede restaurar quitando deleted_at por SQL."
        confirmLabel="Archivar"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="A. Identidad">
            <Field label="Nombre">{terreno.nombre}</Field>
            <Field label="Clave interna">{terreno.clave_interna ?? '—'}</Field>
            <Field label="Tipo">{terreno.tipo ?? '—'}</Field>
            <Field label="Objetivo">{terreno.objetivo ?? '—'}</Field>
            <Field label="# Escritura">{terreno.numero_escritura ?? '—'}</Field>
            <Field label="Fecha captura">{formatDateShort(terreno.fecha_captura)}</Field>
          </Section>

          <Section title="B. Ubicación">
            <Field label="Municipio">{terreno.municipio ?? '—'}</Field>
            <Field label="Zona / Sector">{terreno.zona_sector ?? '—'}</Field>
            <Field label="Dirección / Referencia" wide>
              {terreno.direccion_referencia ?? '—'}
            </Field>
            {mapSrc ? (
              <div className="col-span-full mt-2 overflow-hidden rounded-lg border border-[var(--border)]">
                <iframe
                  title={`Mapa de ${terreno.nombre}`}
                  src={mapSrc}
                  width="100%"
                  height="260"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="col-span-full mt-2 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text)]/55">
                <MapPin className="size-4" />
                Sin ubicación capturada. Agrega municipio o dirección para ver el mapa.
              </div>
            )}
          </Section>

          <Section title="C. Contacto">
            <Field label="Propietario">{terreno.nombre_propietario ?? '—'}</Field>
            <Field label="Teléfono propietario">{terreno.telefono_propietario ?? '—'}</Field>
            <Field label="Corredor">{terreno.nombre_corredor ?? '—'}</Field>
            <Field label="Teléfono corredor">{terreno.telefono_corredor ?? '—'}</Field>
          </Section>

          <Section title="D. Económica">
            <Field label="Precio solicitado /m²">
              {formatCurrency(terreno.precio_solicitado_m2)}
            </Field>
            <Field label="Precio ofertado /m²">{formatCurrency(terreno.precio_ofertado_m2)}</Field>
            <Field label="% Diferencia">
              {formatPercent(terreno.pct_diferencia_solicitado_oferta)}
            </Field>
            <Field label="Valor interno estimado">
              {formatCurrency(terreno.valor_interno_estimado)}
            </Field>
            <Field label="Valor objetivo de compra">
              {formatCurrency(terreno.valor_objetivo_compra)}
            </Field>
          </Section>

          <Section title="E. Gestión">
            <Field label="Origen">{terreno.origen ?? '—'}</Field>
            <Field label="Estatus propiedad">
              {terreno.estatus_propiedad
                ? (TERRENO_ESTATUS_PROPIEDAD_LABEL[
                    terreno.estatus_propiedad as TerrenoEstatusPropiedad
                  ] ?? terreno.estatus_propiedad)
                : '—'}
            </Field>
            <Field label="Decisión actual">{terreno.decision_actual ?? '—'}</Field>
            <Field label="Prioridad">
              {terreno.prioridad
                ? (PRIORIDAD_CONFIG[terreno.prioridad as PrioridadNivel]?.label ??
                  terreno.prioridad)
                : '—'}
            </Field>
            <Field label="Responsable">
              {terreno.responsable_id ? (
                <span className="font-mono text-xs text-[var(--text)]/60">
                  {terreno.responsable_id.slice(0, 8)}…
                </span>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Última revisión">{formatDateShort(terreno.fecha_ultima_revision)}</Field>
            <Field label="Siguiente acción" wide>
              {terreno.siguiente_accion ?? '—'}
            </Field>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="F. Cálculos">
            <Field label="Área total">{formatM2(terreno.area_terreno_m2)}</Field>
            <Field label="Áreas de afectación">{formatM2(terreno.areas_afectacion_m2)}</Field>
            <Field label="Áreas aprovechables">{formatM2(terreno.areas_aprovechables_m2)}</Field>
            <Field label="Valor predio">{formatCurrency(terreno.valor_predio)}</Field>
            <Field label="Valor total oferta">{formatCurrency(terreno.valor_total_oferta)}</Field>
          </Section>

          <Section title="H. Documentos">
            <DocLink label="Imagen ZCU" url={terreno.imagen_zcu_url} />
            <DocLink label="Archivo KMZ" url={terreno.archivo_kmz_url} />
            <DocLink label="PDF Escritura" url={terreno.pdf_escritura_url} />
            {Array.isArray(terreno.documentos) && terreno.documentos.length > 0 ? (
              <ul className="col-span-full space-y-1 text-sm">
                {(terreno.documentos as Array<{ url?: string; label?: string; kind?: string }>).map(
                  (d, i) =>
                    d.url ? (
                      <li key={i}>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                        >
                          <ExternalLink className="size-3.5" />
                          {d.label ?? d.kind ?? `Documento ${i + 1}`}
                        </a>
                      </li>
                    ) : null
                )}
              </ul>
            ) : null}
            {terreno.notas ? (
              <div className="col-span-full pt-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/45">
                  Notas
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]/75">
                  {terreno.notas}
                </p>
              </div>
            ) : null}
          </Section>

          <Section title="G. Continuidad">
            <div className="col-span-full text-sm text-[var(--text)]/55">
              Los anteproyectos derivados aparecerán aquí cuando el módulo Anteproyectos esté
              disponible.{' '}
              <Link href="/dilesa/anteproyectos" className="text-[var(--accent)] hover:underline">
                Ver anteproyectos →
              </Link>
            </div>
          </Section>
        </div>
      </div>
    </div>
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

function DocLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/45">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Abrir
          </a>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        )}
      </dd>
    </div>
  );
}

function EtapaBadgeLarge({ etapa }: { etapa: string | null }) {
  if (!etapa) return null;
  const cfg = TERRENO_ETAPA_CONFIG[etapa as TerrenoEtapa];
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

export default function TerrenoDetailPage() {
  return (
    <RequireAccess empresa="dilesa">
      <TerrenoDetailInner />
    </RequireAccess>
  );
}
