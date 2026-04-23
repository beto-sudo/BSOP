'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern consistente con juntas/[id] y tasks detail.
 */

/**
 * Detalle de un anteproyecto.
 *
 * Layout en 3 columnas (desktop):
 *   IZQ (4/12): captura — Identidad / Inputs físicos / Gestión / Notas
 *   CENTRO (5/12): panel financiero en vivo (v_anteproyectos_analisis)
 *   DER (3/12): prototipos de referencia editables (M:N)
 *
 * Header:
 *   - Badge de estado grande + botón "Convertir a Proyecto"
 *   - Si estado = convertido_a_proyecto → link "Ver proyecto →" en lugar del
 *     botón de conversión.
 *
 * La conversión llama a POST /api/dilesa/anteproyectos/[id]/convertir.
 * El botón se deshabilita (con tooltip explicativo) si faltan precondiciones:
 *   - terreno_id null
 *   - area_vendible_m2 <= 0
 *   - cantidad_lotes <= 0
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
} from '@/lib/dilesa-constants';
import {
  ANTEPROYECTO_ESTADO_CONFIG,
  PRIORIDAD_CONFIG,
  type AnteproyectoEstado,
  type PrioridadNivel,
} from '@/lib/status-tokens';
import {
  AnteproyectoPanelFinanciero,
  type PanelFinancieroData,
} from '@/components/dilesa/anteproyecto-panel-financiero';
import { PrototipoMultiselect } from '@/components/dilesa/prototipo-multiselect';
import { ConvertirAProyectoModal } from '@/components/dilesa/convertir-a-proyecto-modal';

type AnteproyectoFull = {
  id: string;
  empresa_id: string;
  nombre: string;
  clave_interna: string | null;
  terreno_id: string;
  tipo_proyecto_id: string | null;
  fecha_inicio: string | null;
  plano_lotificacion_url: string | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  cantidad_lotes: number | null;
  infraestructura_cabecera_inversion: number | null;
  estado: string;
  convertido_a_proyecto_en: string | null;
  convertido_a_proyecto_por: string | null;
  proyecto_id: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  motivo_no_viable: string | null;
  notas: string | null;
  lote_promedio_m2: number | null;
  created_at: string;
  updated_at: string;
  terreno: { id: string; nombre: string; municipio: string | null } | null;
  tipo_proyecto: { id: string; nombre: string } | null;
};

function AnteproyectoDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [ap, setAp] = useState<AnteproyectoFull | null>(null);
  const [analisis, setAnalisis] = useState<PanelFinancieroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConvertir, setShowConvertir] = useState(false);

  const loadAp = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('anteproyectos')
      .select(
        '*, terreno:terreno_id(id, nombre, municipio), tipo_proyecto:tipo_proyecto_id(id, nombre)'
      )
      .eq('id', id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setAp(null);
      return;
    }
    setAp((data as unknown as AnteproyectoFull | null) ?? null);
  }, [supabase, id]);

  const loadAnalisis = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .schema('dilesa')
      .from('v_anteproyectos_analisis')
      .select(
        'aprovechamiento_pct, porcentaje_areas_verdes, lote_promedio_m2, precio_m2_aprovechable, prototipos_referenciados, valor_comercial_proyecto, costo_total_proyecto, utilidad_proyecto, margen_pct'
      )
      .eq('id', id)
      .maybeSingle();
    setAnalisis((data as PanelFinancieroData | null) ?? null);
  }, [supabase, id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await Promise.all([loadAp(), loadAnalisis()]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadAp, loadAnalisis]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-4" />
          <Skeleton className="h-80 lg:col-span-5" />
          <Skeleton className="h-80 lg:col-span-3" />
        </div>
      </div>
    );
  }

  if (error || !ap) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dilesa/anteproyectos')}>
          <ArrowLeft className="size-4" />
          Volver a Anteproyectos
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error ?? 'No se encontró el anteproyecto o fue archivado.'}
        </div>
      </div>
    );
  }

  const yaConvertido = ap.estado === 'convertido_a_proyecto';
  const missing: string[] = [];
  if (!ap.terreno_id) missing.push('terreno');
  if (!ap.area_vendible_m2 || ap.area_vendible_m2 <= 0) missing.push('área vendible > 0');
  if (!ap.cantidad_lotes || ap.cantidad_lotes <= 0) missing.push('cantidad de lotes > 0');
  const canConvert = !yaConvertido && missing.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => router.push('/dilesa/anteproyectos')}
            aria-label="Volver a Anteproyectos"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
              DILESA · Anteproyecto
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--text)]">
              {ap.nombre}
            </h1>
            {ap.clave_interna ? (
              <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-[var(--text)]/45">
                {ap.clave_interna}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <EstadoBadgeLarge estado={ap.estado} />

          {yaConvertido && ap.proyecto_id ? (
            <Link
              href={`/dilesa/proyectos/${ap.proyecto_id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
            >
              Ver proyecto
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Button
              type="button"
              onClick={() => setShowConvertir(true)}
              disabled={!canConvert}
              title={
                !canConvert && missing.length > 0
                  ? `Faltan datos: ${missing.join(', ')}`
                  : yaConvertido
                    ? 'Este anteproyecto ya fue convertido'
                    : undefined
              }
              size="sm"
            >
              <ArrowRight className="size-4" />
              Convertir a Proyecto
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <Section title="Identidad">
            <Field label="Nombre">{ap.nombre}</Field>
            <Field label="Clave interna">{ap.clave_interna ?? '—'}</Field>
            <Field label="Terreno">
              {ap.terreno ? (
                <Link
                  href={`/dilesa/terrenos/${ap.terreno_id}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {ap.terreno.nombre}
                </Link>
              ) : (
                '—'
              )}
              {ap.terreno?.municipio ? (
                <span className="block text-[11px] text-[var(--text)]/45">
                  {ap.terreno.municipio}
                </span>
              ) : null}
            </Field>
            <Field label="Tipo de proyecto">{ap.tipo_proyecto?.nombre ?? '—'}</Field>
            <Field label="Fecha inicio">{formatDateShort(ap.fecha_inicio)}</Field>
            <Field label="Plano lotificación" wide>
              {ap.plano_lotificacion_url ? (
                <a
                  href={ap.plano_lotificacion_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Abrir plano
                </a>
              ) : (
                <span className="text-[var(--text)]/40">—</span>
              )}
            </Field>
          </Section>

          <Section title="Inputs físicos">
            <Field label="Área vendible">{formatM2(ap.area_vendible_m2)}</Field>
            <Field label="Áreas verdes">{formatM2(ap.areas_verdes_m2)}</Field>
            <Field label="Cantidad de lotes">
              {ap.cantidad_lotes ?? <span className="text-[var(--text)]/40">—</span>}
            </Field>
            <Field label="Infraestructura cabecera">
              {formatCurrency(ap.infraestructura_cabecera_inversion)}
            </Field>
          </Section>

          <Section title="Gestión">
            <Field label="Estado" wide>
              <EstadoBadgeLarge estado={ap.estado} />
            </Field>
            <Field label="Etapa">{ap.etapa ?? '—'}</Field>
            <Field label="Decisión actual">{ap.decision_actual ?? '—'}</Field>
            <Field label="Prioridad">
              {ap.prioridad
                ? (PRIORIDAD_CONFIG[ap.prioridad as PrioridadNivel]?.label ?? ap.prioridad)
                : '—'}
            </Field>
            <Field label="Responsable">
              {ap.responsable_id ? (
                <span className="font-mono text-xs text-[var(--text)]/60">
                  {ap.responsable_id.slice(0, 8)}…
                </span>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Última revisión">{formatDateShort(ap.fecha_ultima_revision)}</Field>
            <Field label="Siguiente acción" wide>
              {ap.siguiente_accion ?? '—'}
            </Field>
            {ap.estado === 'no_viable' ? (
              <Field label="Motivo no viable" wide>
                <span className="text-red-400">{ap.motivo_no_viable ?? '—'}</span>
              </Field>
            ) : null}
          </Section>

          {ap.notas ? (
            <Section title="Notas">
              <div className="col-span-full whitespace-pre-wrap text-sm text-[var(--text)]/80">
                {ap.notas}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-5">
          <AnteproyectoPanelFinanciero data={analisis} />
          {yaConvertido ? (
            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Convertido a proyecto
              </h3>
              <p className="mt-1 text-sm text-[var(--text)]/75">
                {formatDateShort(ap.convertido_a_proyecto_en)} — el análisis financiero actual es
                referencia histórica; los números vivos están en el proyecto.
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-3">
          <PrototipoMultiselect anteproyectoId={ap.id} onChange={() => void loadAnalisis()} />
        </div>
      </div>

      <ConvertirAProyectoModal
        open={showConvertir}
        onOpenChange={setShowConvertir}
        anteproyectoId={ap.id}
        defaultNombre={ap.nombre}
      />
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

function EstadoBadgeLarge({ estado }: { estado: string | null }) {
  if (!estado) return null;
  const cfg = ANTEPROYECTO_ESTADO_CONFIG[estado as AnteproyectoEstado];
  if (!cfg) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)]/65">
        {estado}
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

export default function AnteproyectoDetailPage() {
  return (
    <RequireAccess empresa="dilesa">
      <AnteproyectoDetailInner />
    </RequireAccess>
  );
}
