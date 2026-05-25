'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de captura DILESA
 * (cf. app/dilesa/ventas/nueva/page.tsx y construccion/[id]/page.tsx).
 * Después del load setea catalogos en estado; el defaults effect re-genera
 * el form state cuando cambia el default de fecha/revisor.
 */

/**
 * Captura: Registrar tareas terminadas en una construcción (DILESA).
 *
 * Iniciativa dilesa-construccion · Sprint 4. Esta es la captura MÁS
 * FRECUENTE del módulo — el supervisor hace varias por visita a obra.
 *
 * UX multi-tarea: en lugar de un form por tarea (que forzaría re-navegación
 * y N round-trips), mostramos TODAS las tareas pendientes del prototipo
 * agrupadas por etapa, con checkbox + campos condicionales (fecha terminada,
 * MO pagada, revisor). El operador marca varias y guarda en bulk. Después
 * del save el trigger `tg_construccion_avance` recalcula `avance_pct` y
 * dispara los cambios de estado si aplica (20% → en_construccion, 100% →
 * terminada).
 *
 * Idempotencia: el form filtra las tareas ya cerradas (no las muestra). Si
 * hay carrera (otro usuario cerró la misma tarea entre load y submit), el
 * UNIQUE (construccion_id, plantilla_tarea_id) lo bloquea — capturamos el
 * error 23505 por fila, reportamos el conteo de éxitos y dejamos al usuario
 * refrescar para ver el estado real.
 *
 * Acceso: sub-slug `dilesa.construccion.tareas` (ADR-030).
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

type ObraCtx = {
  id: string;
  codigo: string;
  producto_id: string;
  contratista_id: string;
  unidad_id: string;
  avance_pct: number;
  fecha_arranque: string | null;
  estado: string;
};

type EtapaCat = { id: string; nombre: string; orden: number };
type TareaCat = { id: string; nombre: string };
type Plantilla = {
  id: string;
  tarea_id: string;
  etapa_id: string;
  porcentaje_costo: number;
  costo_mo_plantilla: number;
};
type Persona = { id: string; nombre: string };

/** Estado por tarea pendiente del form. */
type TareaForm = {
  plantillaId: string;
  marcada: boolean;
  fechaTerminada: string; // YYYY-MM-DD
  manoObraPagada: string; // string para no perder vacío vs 0
  revisorId: string;
};

/**
 * @module Construcción · Registrar tareas (DILESA)
 * @responsive desktop-only
 */
export default function RegistrarTareaPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.tareas" write>
      <RegistrarTareaForm />
    </RequireAccess>
  );
}

function RegistrarTareaForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);
  const obraId = params.id;

  const [obra, setObra] = useState<ObraCtx | null>(null);
  const [unidadIdentificador, setUnidadIdentificador] = useState<string | null>(null);
  const [prototipoNombre, setPrototipoNombre] = useState<string | null>(null);
  const [contratistaNombre, setContratistaNombre] = useState<string | null>(null);

  const [etapas, setEtapas] = useState<EtapaCat[]>([]);
  const [tareasCat, setTareasCat] = useState<Map<string, TareaCat>>(new Map());
  const [plantilla, setPlantilla] = useState<Plantilla[]>([]);
  const [terminadasIds, setTerminadasIds] = useState<Set<string>>(new Set());
  const [personas, setPersonas] = useState<Persona[]>([]);

  const [formState, setFormState] = useState<Map<string, TareaForm>>(new Map());
  const [defaultFecha, setDefaultFecha] = useState<string>(new Date().toISOString().slice(0, 10));
  const [defaultRevisorId, setDefaultRevisorId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Cargar contexto ──────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!obraId) return;
    setLoading(true);
    setError(null);

    const { data: oRow, error: oErr } = await sb
      .schema('dilesa')
      .from('construccion')
      .select(
        'id, codigo, producto_id, contratista_id, unidad_id, avance_pct, fecha_arranque, estado'
      )
      .eq('id', obraId)
      .is('deleted_at', null)
      .maybeSingle();
    if (oErr) {
      setError(getSupabaseErrorMessage(oErr, 'No se pudo cargar la obra.'));
      setLoading(false);
      return;
    }
    if (!oRow) {
      setError('Obra no encontrada.');
      setLoading(false);
      return;
    }
    const obraRow = oRow as unknown as ObraCtx;
    setObra(obraRow);

    const [uRes, prodRes, contRes, plRes, etRes, taRes, ttRes, persRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select('identificador')
        .eq('id', obraRow.unidad_id)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('productos')
        .select('nombre')
        .eq('id', obraRow.producto_id)
        .maybeSingle(),
      sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno')
        .eq('id', obraRow.contratista_id)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('plantilla_tareas')
        .select('id, tarea_id, etapa_id, porcentaje_costo, costo_mo_plantilla')
        .eq('producto_id', obraRow.producto_id)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('etapas_construccion')
        .select('id, nombre, orden')
        .is('deleted_at', null)
        .order('orden', { ascending: true }),
      sb.schema('dilesa').from('tareas_construccion').select('id, nombre').is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('construccion_tareas_terminadas')
        .select('plantilla_tarea_id')
        .eq('construccion_id', obraRow.id)
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('activo', true),
    ]);

    const firstErr =
      uRes.error ??
      prodRes.error ??
      contRes.error ??
      plRes.error ??
      etRes.error ??
      taRes.error ??
      ttRes.error ??
      persRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el contexto de la obra.'));
      setLoading(false);
      return;
    }

    setUnidadIdentificador((uRes.data?.identificador as string | null) ?? null);
    setPrototipoNombre((prodRes.data?.nombre as string | null) ?? null);
    setContratistaNombre(
      contRes.data
        ? [contRes.data.nombre, contRes.data.apellido_paterno, contRes.data.apellido_materno]
            .filter(Boolean)
            .join(' ') || null
        : null
    );

    setPlantilla((plRes.data ?? []) as Plantilla[]);
    setEtapas((etRes.data ?? []) as EtapaCat[]);
    const tMap = new Map<string, TareaCat>();
    for (const t of taRes.data ?? []) tMap.set(t.id as string, { id: t.id, nombre: t.nombre });
    setTareasCat(tMap);
    setTerminadasIds(new Set((ttRes.data ?? []).map((t) => t.plantilla_tarea_id as string)));

    const personasOrdenadas: Persona[] = (persRes.data ?? [])
      .map((p) => ({
        id: p.id as string,
        nombre:
          [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
          '(sin nombre)',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    setPersonas(personasOrdenadas);

    setLoading(false);
  }, [obraId, sb]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Etapas con sus tareas pendientes (excluye las ya cerradas).
  const etapasConPendientes = useMemo(() => {
    return etapas
      .map((et) => {
        const items = plantilla
          .filter((p) => p.etapa_id === et.id && !terminadasIds.has(p.id))
          .map((p) => {
            const tareaInfo = tareasCat.get(p.tarea_id);
            return {
              plantillaId: p.id,
              nombre: tareaInfo?.nombre ?? '(tarea desconocida)',
              porcentajeCosto: Number(p.porcentaje_costo ?? 0),
              costoMoPlantilla: Number(p.costo_mo_plantilla ?? 0),
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        return { ...et, items };
      })
      .filter((et) => et.items.length > 0);
  }, [etapas, plantilla, terminadasIds, tareasCat]);

  const totalPendientes = useMemo(
    () => etapasConPendientes.reduce((s, et) => s + et.items.length, 0),
    [etapasConPendientes]
  );

  const marcadas = useMemo(() => [...formState.values()].filter((v) => v.marcada), [formState]);

  const sumaPctEstimado = useMemo(() => {
    let total = 0;
    for (const m of marcadas) {
      const p = plantilla.find((pl) => pl.id === m.plantillaId);
      if (p) total += Number(p.porcentaje_costo ?? 0);
    }
    return total;
  }, [marcadas, plantilla]);

  // ── Handlers de form ─────────────────────────────────────────────────────
  function ensureRow(plantillaId: string): TareaForm {
    return (
      formState.get(plantillaId) ?? {
        plantillaId,
        marcada: false,
        fechaTerminada: defaultFecha,
        manoObraPagada: '',
        revisorId: defaultRevisorId,
      }
    );
  }

  function toggleMarcada(plantillaId: string, marcada: boolean) {
    setFormState((prev) => {
      const next = new Map(prev);
      const base = ensureRow(plantillaId);
      next.set(plantillaId, { ...base, marcada });
      return next;
    });
  }

  function updateField<K extends keyof Omit<TareaForm, 'plantillaId' | 'marcada'>>(
    plantillaId: string,
    key: K,
    value: TareaForm[K]
  ) {
    setFormState((prev) => {
      const next = new Map(prev);
      const base = ensureRow(plantillaId);
      next.set(plantillaId, { ...base, [key]: value });
      return next;
    });
  }

  function marcarTodasDeEtapa(etapaId: string) {
    setFormState((prev) => {
      const next = new Map(prev);
      const et = etapasConPendientes.find((e) => e.id === etapaId);
      if (!et) return prev;
      for (const it of et.items) {
        const base = ensureRow(it.plantillaId);
        next.set(it.plantillaId, { ...base, marcada: true });
      }
      return next;
    });
  }

  // Aplicar defaults a todas las filas existentes cuando cambien.
  useEffect(() => {
    setFormState((prev) => {
      const next = new Map(prev);
      for (const [k, v] of next.entries()) {
        next.set(k, {
          ...v,
          // Solo sobreescribir si el usuario no ha tocado el campo (heurística:
          // si aún coincide con el default anterior). Para mantener simple,
          // solo aplicamos a las no marcadas.
          fechaTerminada: v.marcada ? v.fechaTerminada : defaultFecha,
          revisorId: v.marcada ? v.revisorId : defaultRevisorId,
        });
      }
      return next;
    });
  }, [defaultFecha, defaultRevisorId]);

  // ── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!obra) return;
    if (marcadas.length === 0) {
      toast.add({
        title: 'Sin tareas seleccionadas',
        description: 'Marca al menos una tarea para registrar.',
        type: 'error',
      });
      return;
    }
    setSubmitting(true);

    // Bulk insert — el trigger recalcula avance UNA vez por insert. Si hay
    // muchas, son N triggers pero todos sobre la misma construccion (rápido).
    const rows = marcadas.map((m) => ({
      empresa_id: DILESA_EMPRESA_ID,
      construccion_id: obra.id,
      plantilla_tarea_id: m.plantillaId,
      fecha_terminada: m.fechaTerminada || new Date().toISOString().slice(0, 10),
      mano_obra_pagada: m.manoObraPagada ? Number(m.manoObraPagada) : null,
      revisado_por_persona_id: m.revisorId || null,
    }));

    const { data, error: insErr } = await sb
      .schema('dilesa')
      .from('construccion_tareas_terminadas')
      .insert(rows)
      .select('id, plantilla_tarea_id');

    if (insErr) {
      // Si fue duplicado (carrera con otro user), informar específico.
      const msg =
        insErr.code === '23505'
          ? 'Una o más tareas ya estaban registradas. Refresca la página para ver el estado actual.'
          : getSupabaseErrorMessage(insErr, 'No se pudieron registrar las tareas.');
      toast.add({
        title: 'Error al registrar tareas',
        description: msg,
        type: 'error',
      });
      setSubmitting(false);
      return;
    }

    const insertados = data?.length ?? 0;

    // Releer avance actualizado (el trigger ya corrió).
    const { data: nuevoAvance } = await sb
      .schema('dilesa')
      .from('construccion')
      .select('avance_pct, estado')
      .eq('id', obra.id)
      .maybeSingle();

    const avancePost = (nuevoAvance?.avance_pct as number | undefined) ?? null;
    const cruzo20 = obra.avance_pct < 20 && avancePost != null && avancePost >= 20;
    const cruzo100 = obra.avance_pct < 100 && avancePost != null && avancePost >= 100;

    let descripcion = `${insertados} ${insertados === 1 ? 'tarea registrada' : 'tareas registradas'}.`;
    if (avancePost != null) descripcion += ` Avance: ${avancePost.toFixed(0)}%.`;
    if (cruzo100) descripcion += ' La obra cruzó 100% — la unidad pasa a estado "terminada".';
    else if (cruzo20)
      descripcion += ' La obra cruzó 20% — la unidad ya está disponible para venta.';

    toast.add({
      title: 'Tareas registradas',
      description: descripcion,
      type: 'success',
    });
    setSubmitting(false);
    router.push(`/dilesa/construccion/${obra.id}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !obra) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <BackLink id={obraId} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Obra no encontrada.'}
        </div>
      </div>
    );
  }

  const protoSufijo = prototipoNombre ? prototipoNombre.split('-').pop() : null;
  const identificadorCompleto = unidadIdentificador
    ? protoSufijo
      ? `${unidadIdentificador}-${protoSufijo}`
      : unidadIdentificador
    : obra.codigo;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-6">
      <BackLink id={obraId} />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Registrar tareas terminadas</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            Obra <span className="font-medium text-foreground">{identificadorCompleto}</span>
          </span>
          {prototipoNombre ? <span>· {prototipoNombre}</span> : null}
          {contratistaNombre ? <span>· {contratistaNombre}</span> : null}
          <span>· Avance actual {obra.avance_pct.toFixed(0)}%</span>
        </div>
      </header>

      <Section title="Defaults para esta sesión">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha terminada (default)">
            <Input
              type="date"
              value={defaultFecha}
              onChange={(e) => setDefaultFecha(e.target.value)}
            />
            <Hint>
              Aplica a las tareas no marcadas todavía. Cada fila se puede ajustar individualmente.
            </Hint>
          </Field>
          <Field label="Revisor (default)">
            <select
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
              value={defaultRevisorId}
              onChange={(e) => setDefaultRevisorId(e.target.value)}
            >
              <option value="">— ninguno —</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Tareas pendientes por etapa"
        description={
          totalPendientes === 0
            ? 'Todas las tareas de la plantilla están registradas.'
            : `${totalPendientes} pendientes · ${marcadas.length} marcadas (≈ ${sumaPctEstimado.toFixed(1)}% de costo)`
        }
      >
        {etapasConPendientes.length === 0 ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]/40 p-4 text-sm text-muted-foreground">
            La obra no tiene tareas pendientes — la plantilla del prototipo está completa para esta
            construcción.
          </div>
        ) : (
          <div className="space-y-3">
            {etapasConPendientes.map((et) => (
              <EtapaBlock
                key={et.id}
                etapa={et}
                formState={formState}
                personas={personas}
                onToggle={toggleMarcada}
                onUpdate={updateField}
                onMarcarTodas={() => marcarTodasDeEtapa(et.id)}
                defaultFecha={defaultFecha}
                defaultRevisorId={defaultRevisorId}
              />
            ))}
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Al guardar, el trigger recalcula el avance y marca la unidad como disponible si cruza 20%,
          o como terminada si llega a 100%.
        </p>
        <div className="flex items-center gap-3">
          <Link href={`/dilesa/construccion/${obra.id}`}>
            <Button variant="outline" disabled={submitting}>
              Cancelar
            </Button>
          </Link>
          <Button onClick={onSubmit} disabled={submitting || marcadas.length === 0}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar {marcadas.length > 0 ? `(${marcadas.length})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ─────────────────────────────────────────────────────────

function EtapaBlock({
  etapa,
  formState,
  personas,
  onToggle,
  onUpdate,
  onMarcarTodas,
  defaultFecha,
  defaultRevisorId,
}: {
  etapa: {
    id: string;
    nombre: string;
    orden: number;
    items: Array<{
      plantillaId: string;
      nombre: string;
      porcentajeCosto: number;
      costoMoPlantilla: number;
    }>;
  };
  formState: Map<string, TareaForm>;
  personas: Persona[];
  onToggle: (plantillaId: string, marcada: boolean) => void;
  onUpdate: <K extends keyof Omit<TareaForm, 'plantillaId' | 'marcada'>>(
    plantillaId: string,
    key: K,
    value: TareaForm[K]
  ) => void;
  onMarcarTodas: () => void;
  defaultFecha: string;
  defaultRevisorId: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)]/60 px-3 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {etapa.orden}
          </span>
          <h3 className="text-sm font-medium">{etapa.nombre}</h3>
          <span className="text-xs text-muted-foreground">{etapa.items.length} pendientes</span>
        </div>
        <button
          type="button"
          onClick={onMarcarTodas}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Check className="h-3 w-3" /> Marcar toda la etapa
        </button>
      </header>
      <ul className="divide-y divide-[var(--border)]/40">
        {etapa.items.map((it) => {
          const row = formState.get(it.plantillaId) ?? {
            plantillaId: it.plantillaId,
            marcada: false,
            fechaTerminada: defaultFecha,
            manoObraPagada: '',
            revisorId: defaultRevisorId,
          };
          return (
            <li key={it.plantillaId} className="px-3 py-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
                  checked={row.marcada}
                  onChange={(e) => onToggle(it.plantillaId, e.target.checked)}
                />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{it.nombre}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {it.porcentajeCosto.toFixed(2)}%
                      {it.costoMoPlantilla > 0
                        ? ` · MO plantilla ${formatoMoney(it.costoMoPlantilla)}`
                        : ''}
                    </span>
                  </div>
                  {row.marcada ? (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Fecha terminada
                        </div>
                        <Input
                          type="date"
                          value={row.fechaTerminada}
                          onChange={(e) =>
                            onUpdate(it.plantillaId, 'fechaTerminada', e.target.value)
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          MO pagada (opcional)
                        </div>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder={it.costoMoPlantilla > 0 ? String(it.costoMoPlantilla) : '0'}
                          value={row.manoObraPagada}
                          onChange={(e) =>
                            onUpdate(it.plantillaId, 'manoObraPagada', e.target.value)
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Revisor
                        </div>
                        <select
                          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs"
                          value={row.revisorId}
                          onChange={(e) => onUpdate(it.plantillaId, 'revisorId', e.target.value)}
                        >
                          <option value="">— ninguno —</option>
                          {personas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/dilesa/construccion/${id}`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Volver a la obra
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
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function formatoMoney(n: number): string {
  return moneyFmt.format(n);
}
