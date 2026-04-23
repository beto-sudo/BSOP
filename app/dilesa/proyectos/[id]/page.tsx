'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern consistente con el resto del sprint dilesa-1.
 */

/**
 * Scaffold temporal del detail de Proyecto.
 *
 * Este archivo existe para que el redirect post-"Convertir a Proyecto"
 * tenga un destino visible y coherente. El módulo Proyectos completo
 * (tabs Info / Lotes / Prototipos / Presupuesto / Documentos, edición,
 * archivar, lotificación, progreso de obra) llega en el siguiente PR:
 * feat/dilesa-ui-proyectos.
 *
 * Scope actual (read-only):
 *   - Secciones Identidad / Económica / Gestión / Notas
 *   - Header con badge de fase y link "← Anteproyectos" cuando aplique
 */

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
} from '@/lib/dilesa-constants';
import { PRIORIDAD_CONFIG, type PrioridadNivel } from '@/lib/status-tokens';

type ProyectoFull = {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  terreno_id: string;
  anteproyecto_id: string | null;
  tipo_proyecto_id: string | null;
  fase: string | null;
  fecha_inicio: string | null;
  fecha_estimada_cierre: string | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  cantidad_lotes_total: number | null;
  presupuesto_total: number | null;
  inversion_total: number | null;
  notas: string | null;
  etapa: string | null;
  decision_actual: string | null;
  prioridad: string | null;
  responsable_id: string | null;
  fecha_ultima_revision: string | null;
  siguiente_accion: string | null;
  terreno: { id: string; nombre: string; municipio: string | null } | null;
  anteproyecto: { id: string; nombre: string; clave_interna: string | null } | null;
  tipo_proyecto: { id: string; nombre: string } | null;
};

function ProyectoDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [proyecto, setProyecto] = useState<ProyectoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .select(
        '*, terreno:terreno_id(id, nombre, municipio), anteproyecto:anteproyecto_id(id, nombre, clave_interna), tipo_proyecto:tipo_proyecto_id(id, nombre)'
      )
      .eq('id', id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setProyecto(null);
      return;
    }
    setProyecto((data as unknown as ProyectoFull | null) ?? null);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !proyecto) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dilesa')}>
          <ArrowLeft className="size-4" />
          Volver a DILESA
        </Button>
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error ?? 'No se encontró el proyecto o fue archivado.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() =>
              proyecto.anteproyecto_id
                ? router.push(`/dilesa/anteproyectos/${proyecto.anteproyecto_id}`)
                : router.push('/dilesa')
            }
            aria-label={proyecto.anteproyecto_id ? 'Volver al anteproyecto' : 'Volver a DILESA'}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
              DILESA · Proyecto
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--text)]">
              {proyecto.nombre}
            </h1>
            {proyecto.codigo ? (
              <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-[var(--text)]/45">
                {proyecto.codigo}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FaseBadge fase={proyecto.fase} />
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
        Scaffold temporal del detail de proyecto. El módulo completo (tabs Info / Lotes / Prototipos
        / Presupuesto / Documentos, edición y progreso de obra) llega con{' '}
        <span className="font-mono">feat/dilesa-ui-proyectos</span>.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="A. Identidad">
          <Field label="Nombre">{proyecto.nombre}</Field>
          <Field label="Código">{proyecto.codigo ?? '—'}</Field>
          <Field label="Terreno">
            {proyecto.terreno ? (
              <Link
                href={`/dilesa/terrenos/${proyecto.terreno_id}`}
                className="text-[var(--accent)] hover:underline"
              >
                {proyecto.terreno.nombre}
              </Link>
            ) : (
              '—'
            )}
            {proyecto.terreno?.municipio ? (
              <span className="block text-[11px] text-[var(--text)]/45">
                {proyecto.terreno.municipio}
              </span>
            ) : null}
          </Field>
          <Field label="Anteproyecto origen">
            {proyecto.anteproyecto ? (
              <Link
                href={`/dilesa/anteproyectos/${proyecto.anteproyecto.id}`}
                className="text-[var(--accent)] hover:underline"
              >
                {proyecto.anteproyecto.nombre}
              </Link>
            ) : (
              <span className="text-[var(--text)]/40">(sin anteproyecto origen)</span>
            )}
          </Field>
          <Field label="Tipo de proyecto">{proyecto.tipo_proyecto?.nombre ?? '—'}</Field>
        </Section>

        <Section title="D. Económica">
          <Field label="Presupuesto total">{formatCurrency(proyecto.presupuesto_total)}</Field>
          <Field label="Inversión total">{formatCurrency(proyecto.inversion_total)}</Field>
          <Field label="Área vendible">{formatM2(proyecto.area_vendible_m2)}</Field>
          <Field label="Áreas verdes">{formatM2(proyecto.areas_verdes_m2)}</Field>
          <Field label="Cantidad lotes total">
            {proyecto.cantidad_lotes_total ?? <span className="text-[var(--text)]/40">—</span>}
          </Field>
        </Section>

        <Section title="E. Gestión">
          <Field label="Fase">{proyecto.fase ?? '—'}</Field>
          <Field label="Etapa">{proyecto.etapa ?? '—'}</Field>
          <Field label="Decisión actual">{proyecto.decision_actual ?? '—'}</Field>
          <Field label="Prioridad">
            {proyecto.prioridad
              ? (PRIORIDAD_CONFIG[proyecto.prioridad as PrioridadNivel]?.label ??
                proyecto.prioridad)
              : '—'}
          </Field>
          <Field label="Responsable">
            {proyecto.responsable_id ? (
              <span className="font-mono text-xs text-[var(--text)]/60">
                {proyecto.responsable_id.slice(0, 8)}…
              </span>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Fecha inicio">{formatDateShort(proyecto.fecha_inicio)}</Field>
          <Field label="Cierre estimado">{formatDateShort(proyecto.fecha_estimada_cierre)}</Field>
          <Field label="Última revisión">{formatDateShort(proyecto.fecha_ultima_revision)}</Field>
          <Field label="Siguiente acción" wide>
            {proyecto.siguiente_accion ?? '—'}
          </Field>
        </Section>

        {proyecto.notas ? (
          <Section title="Notas">
            <div className="col-span-full whitespace-pre-wrap text-sm text-[var(--text)]/80">
              {proyecto.notas}
            </div>
          </Section>
        ) : null}
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

function FaseBadge({ fase }: { fase: string | null }) {
  if (!fase) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)]/55">
        Sin fase
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
      {fase}
    </span>
  );
}

export default function ProyectoDetailPage() {
  return (
    <RequireAccess empresa="dilesa">
      <ProyectoDetailInner />
    </RequireAccess>
  );
}
