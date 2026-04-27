'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: setLoading/setError antes de firing async fetch; mismo
 * patrón que terrenos/[id], prototipos/[id] y el resto del panel.
 */

/**
 * Detalle de un proyecto.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-proyectos). Cinco sub-tabs con
 * estado persistido en ?section=… para que el link sea compartible:
 *
 *   - Info general: secciones colapsables A→H (identidad, planeación,
 *     snapshot físico, financiero, gestión, notas). Read-only en v1.
 *   - Lotes: placeholder (dilesa-2 — lotes, urbanizacion_lote, construccion_lote).
 *   - Prototipos asignados: editor M:N de fraccionamiento_prototipo.
 *   - Presupuesto: placeholder (erp-bancos).
 *   - Documentos: placeholder (iteración siguiente).
 *
 * Schema: supabase/SCHEMA_REF.md §dilesa.proyectos, §dilesa.fraccionamiento_prototipo.
 */

import { RequireAccess } from '@/components/require-access';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Archive, Loader2, MoreVertical, Link2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useActionFeedback } from '@/hooks/use-action-feedback';
import { cn } from '@/lib/utils';
import {
  DILESA_EMPRESA_ID,
  formatCurrency,
  formatDateShort,
  formatM2,
} from '@/lib/dilesa-constants';
import {
  PROYECTO_FASE_CONFIG,
  PRIORIDAD_CONFIG,
  type ProyectoFase,
  type PrioridadNivel,
} from '@/lib/status-tokens';
import { FraccionamientoEditor } from '@/components/dilesa/fraccionamiento-editor';

type ProyectoFull = {
  id: string;
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  terreno_id: string;
  terreno: { nombre: string; clave_interna: string | null } | null;
  anteproyecto_id: string | null;
  anteproyecto: { nombre: string; clave_interna: string | null } | null;
  tipo_proyecto_id: string | null;
  tipo_proyecto: { nombre: string } | null;
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
  created_at: string;
  updated_at: string;
};

type Section = 'info' | 'lotes' | 'prototipos' | 'presupuesto' | 'documentos';
const DEFAULT_SECTION: Section = 'info';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'info', label: 'Info general' },
  { key: 'lotes', label: 'Lotes' },
  { key: 'prototipos', label: 'Prototipos asignados' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'documentos', label: 'Documentos' },
];

function useActiveSection(): Section {
  const params = useSearchParams();
  const raw = params.get('section');
  if (
    raw === 'info' ||
    raw === 'lotes' ||
    raw === 'prototipos' ||
    raw === 'presupuesto' ||
    raw === 'documentos'
  ) {
    return raw;
  }
  return DEFAULT_SECTION;
}

function ProyectoDetailInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const active = useActiveSection();

  const [proyecto, setProyecto] = useState<ProyectoFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .select(
        '*, terreno:terreno_id(nombre, clave_interna), anteproyecto:anteproyecto_id(nombre, clave_interna), tipo_proyecto:tipo_proyecto_id(nombre)'
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

  const navigateSection = useCallback(
    (next: Section) => {
      const qs = new URLSearchParams(searchParams);
      if (next === DEFAULT_SECTION) qs.delete('section');
      else qs.set('section', next);
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  const [archiveOpen, setArchiveOpen] = useState(false);
  const feedback = useActionFeedback();

  const handleArchive = async () => {
    if (!proyecto) return;
    setArchiving(true);
    const { error: err } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', proyecto.id);
    setArchiving(false);
    if (err) {
      feedback.error(err, { title: 'No se pudo archivar el proyecto' });
      return;
    }
    feedback.success('Proyecto archivado');
    router.push('/dilesa/proyectos');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-8 w-full max-w-lg" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !proyecto) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/dilesa/proyectos')}>
          <ArrowLeft className="size-4" />
          Volver a Proyectos
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
            onClick={() => router.push('/dilesa/proyectos')}
            aria-label="Volver a Proyectos"
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
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {proyecto.codigo ? (
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--text)]/45">
                  {proyecto.codigo}
                </span>
              ) : null}
              {proyecto.anteproyecto_id ? (
                <Link
                  href={`/dilesa/anteproyectos/${proyecto.anteproyecto_id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                  title={
                    proyecto.anteproyecto?.nombre
                      ? `Desde anteproyecto: ${proyecto.anteproyecto.nombre}`
                      : 'Desde anteproyecto'
                  }
                >
                  <Link2 className="size-3" />← Anteproyecto
                  {proyecto.anteproyecto?.clave_interna
                    ? ` · ${proyecto.anteproyecto.clave_interna}`
                    : ''}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FaseBadgeLarge fase={proyecto.fase} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={(triggerProps) => (
                <Button
                  {...triggerProps}
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Más acciones"
                >
                  <MoreVertical className="size-4" />
                </Button>
              )}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setArchiveOpen(true)}
                disabled={archiving}
              >
                {archiving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Archive className="size-4" />
                )}
                Archivar proyecto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={handleArchive}
        title={`¿Archivar el proyecto "${proyecto.nombre}"?`}
        description="No se elimina de la base de datos; se puede restaurar quitando deleted_at por SQL."
        confirmLabel="Archivar"
      />

      <div
        role="tablist"
        aria-label="Secciones del proyecto"
        className="flex items-center gap-1 border-b border-[var(--border)]"
      >
        {SECTIONS.map((s) => {
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`section-panel-${s.key}`}
              id={`section-tab-${s.key}`}
              onClick={() => navigateSection(s.key)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                '-mb-px border-b-2',
                isActive
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text)]/55 hover:text-[var(--text)]'
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {active === 'info' ? <InfoGeneralPanel proyecto={proyecto} /> : null}
      {active === 'lotes' ? (
        <PlaceholderPanel
          title="Lotes"
          description="Este tab estará disponible con sprint dilesa-2 (dilesa.lotes, urbanizacion_lote, construccion_lote)."
        />
      ) : null}
      {active === 'prototipos' ? (
        <FraccionamientoEditor proyectoId={proyecto.id} anteproyectoId={proyecto.anteproyecto_id} />
      ) : null}
      {active === 'presupuesto' ? (
        <PlaceholderPanel
          title="Presupuesto"
          description="Integración con erp.cotizaciones y erp.movimientos_bancarios llega con sprint erp-bancos."
        />
      ) : null}
      {active === 'documentos' ? (
        <PlaceholderPanel
          title="Documentos"
          description="Pendiente: filtrar erp.documentos por entidad_tipo='proyecto_dilesa' y entidad_id=proyecto.id. Siguiente iteración."
        />
      ) : null}
    </div>
  );
}

function InfoGeneralPanel({ proyecto }: { proyecto: ProyectoFull }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
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
                {proyecto.terreno.clave_interna ? ` (${proyecto.terreno.clave_interna})` : ''}
              </Link>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Anteproyecto origen">
            {proyecto.anteproyecto_id ? (
              <Link
                href={`/dilesa/anteproyectos/${proyecto.anteproyecto_id}`}
                className="text-[var(--accent)] hover:underline"
              >
                {proyecto.anteproyecto?.nombre ??
                  proyecto.anteproyecto?.clave_interna ??
                  'Ver anteproyecto'}
              </Link>
            ) : (
              <span className="text-[var(--text)]/50">Proyecto manual (sin anteproyecto)</span>
            )}
          </Field>
          <Field label="Tipo de proyecto">{proyecto.tipo_proyecto?.nombre ?? '—'}</Field>
        </Section>

        <Section title="B. Planeación">
          <Field label="Fase">
            {proyecto.fase
              ? (PROYECTO_FASE_CONFIG[proyecto.fase as ProyectoFase]?.label ?? proyecto.fase)
              : '—'}
          </Field>
          <Field label="Fecha de inicio">{formatDateShort(proyecto.fecha_inicio)}</Field>
          <Field label="Fecha estimada de cierre">
            {formatDateShort(proyecto.fecha_estimada_cierre)}
          </Field>
        </Section>

        <Section title="C. Snapshot físico">
          <Field label="Área vendible">{formatM2(proyecto.area_vendible_m2)}</Field>
          <Field label="Áreas verdes">{formatM2(proyecto.areas_verdes_m2)}</Field>
          <Field label="Cantidad de lotes total">
            {proyecto.cantidad_lotes_total != null
              ? proyecto.cantidad_lotes_total.toLocaleString('es-MX')
              : '—'}
          </Field>
        </Section>

        <Section title="D. Financiero">
          <Field label="Presupuesto total">{formatCurrency(proyecto.presupuesto_total)}</Field>
          <Field label="Inversión total">{formatCurrency(proyecto.inversion_total)}</Field>
        </Section>

        <Section title="E. Gestión">
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
          <Field label="Última revisión">{formatDateShort(proyecto.fecha_ultima_revision)}</Field>
          <Field label="Siguiente acción" wide>
            {proyecto.siguiente_accion ?? '—'}
          </Field>
        </Section>

        <Section title="F. Notas">
          {proyecto.notas ? (
            <p className="col-span-full whitespace-pre-wrap text-sm text-[var(--text)]/75">
              {proyecto.notas}
            </p>
          ) : (
            <p className="col-span-full text-sm text-[var(--text)]/45">Sin notas capturadas.</p>
          )}
        </Section>
      </div>

      <aside className="space-y-4">
        <Section title="G. Origen">
          {proyecto.anteproyecto_id ? (
            <div className="col-span-full text-sm text-[var(--text)]/70">
              <p>
                Este proyecto nació al convertir un anteproyecto. El anteproyecto sigue siendo
                &ldquo;qué se planeó&rdquo;; el proyecto es &ldquo;qué se está ejecutando&rdquo;.
              </p>
              <Link
                href={`/dilesa/anteproyectos/${proyecto.anteproyecto_id}`}
                className="mt-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                <Link2 className="size-3.5" />
                Ver anteproyecto origen
              </Link>
            </div>
          ) : (
            <div className="col-span-full text-sm text-[var(--text)]/55">
              Proyecto creado manualmente sin anteproyecto de origen (caso legacy).
            </div>
          )}
        </Section>

        <Section title="H. Metadata">
          <Field label="Creado">{formatDateShort(proyecto.created_at)}</Field>
          <Field label="Actualizado">{formatDateShort(proyecto.updated_at)}</Field>
        </Section>

        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-4 text-xs text-[var(--text)]/55">
          La edición inline del expediente llega en iteraciones siguientes. Por ahora v1 es
          read-only.
        </div>
      </aside>
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

function FaseBadgeLarge({ fase }: { fase: string | null }) {
  if (!fase) return null;
  const cfg = PROYECTO_FASE_CONFIG[fase as ProyectoFase];
  if (!cfg) {
    return (
      <span className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)]/65">
        {fase}
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

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8 text-center">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text)]/55">{description}</p>
    </div>
  );
}

export default function ProyectoDetailPage() {
  return (
    <RequireAccess empresa="dilesa">
      <Suspense fallback={<div className="p-6 text-sm text-[var(--text)]/55">Cargando…</div>}>
        <ProyectoDetailInner />
      </Suspense>
    </RequireAccess>
  );
}
