'use client';

/**
 * `<ProyectoChecklist>` — sección "Checklist de tareas" reutilizable por
 * el detalle de cualquier proyecto DILESA, sea **anteproyecto** o
 * **desarrollo**.
 *
 * Sprint 4 de `dilesa-proyectos-checklist-inline` (espejar a desarrollo):
 * extrae el bloque de fetch (tareas + dependencias + pasos) + estado
 * vacío con botón "Poblar plantilla canónica" + render de
 * `<TareasChecklist>` que antes vivía inline en `anteproyecto-detalle.tsx`.
 * Un solo dueño de mantenimiento (ADR-011) — el anteproyecto y el
 * desarrollo montan el mismo componente.
 *
 * El fetch vive aquí adentro. El padre que necesite las tareas (ej. el
 * anteproyecto para su gate de promoción) las recibe vía
 * `onChecklistState`. La instanciación de plantilla filtra por tipo de
 * proyecto automáticamente (`instanciarPlantillaParaProyecto`), así que
 * un desarrollo instancia `aplicacion IN ('desarrollo','ambas')` sin que
 * este componente tenga que saberlo.
 *
 * El banner "Marcar histórico" (solo desarrollo) cierra en bulk las
 * tareas no-terminales — útil tras el backfill de desarrollos que llevan
 * años corriendo y cuyas tareas canónicas ya están superadas.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { DetailDrawerSection } from '@/components/detail-page';
import { Skeleton } from '@/components/ui/skeleton';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  populatePlantilla,
  marcarTareasHistorico,
} from '@/app/dilesa/proyectos/anteproyectos/actions';
import { TareasChecklist, type PasoRow } from './tareas-checklist';
import type { EmpresaSlug } from '@/lib/storage';

export type ProyectoTarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  orden: number;
  tipo_snapshot: string | null;
  subtipo_snapshot: string | null;
  entidad_responsable_snapshot: string | null;
  obligatoriedad_snapshot: string | null;
  requiere_archivo_snapshot: boolean | null;
  fecha_objetivo_inicio: string | null;
  fecha_objetivo_fin: string | null;
  fecha_completada: string | null;
  resultado_monto: number | null;
  resultado_documento_url: string | null;
  plantilla_tarea_id: string | null;
};

export type TareaDep = { tarea_id: string; depende_de_tarea_id: string };

/** Estados de tarea que NO son terminales — candidatos a "marcar histórico". */
const ESTADOS_NO_TERMINALES = ['pendiente', 'en_curso', 'bloqueada'];

/**
 * Copy del estado vacío + el conteo de tareas canónicas, según el tipo
 * de proyecto. Las tareas que se instancian dependen de `aplicacion`
 * en el catálogo, por eso el copy difiere. Exportado para tests.
 */
export function emptyStateCopy(tipo: string): { titulo: string; descripcion: string } {
  if (tipo === 'anteproyecto') {
    return {
      titulo: 'Sin tareas instanciadas todavía.',
      descripcion:
        'Las tareas canónicas del anteproyecto (trámites + factibilidades) se instancian con fechas objetivo calculadas desde la fecha de arranque + grafo de dependencias + calendario hábil MX.',
    };
  }
  return {
    titulo: 'Sin tareas instanciadas todavía.',
    descripcion:
      'Las tareas canónicas del desarrollo (urbanización, construcción, comercialización, RUV, seguro de calidad) se instancian con fechas objetivo calculadas desde la fecha de arranque + grafo de dependencias + calendario hábil MX.',
  };
}

/** Cuenta las tareas no-terminales (las que el banner marcaría histórico). */
export function contarNoTerminales(tareas: readonly { estado: string }[]): number {
  return tareas.filter((t) => ESTADOS_NO_TERMINALES.includes(t.estado)).length;
}

export function ProyectoChecklist({
  proyectoId,
  tipo,
  fechaArranque,
  empresaId,
  empresaSlug,
  puedeAutorizar = false,
  mostrarBannerHistorico = false,
  onChecklistState,
}: {
  proyectoId: string;
  /** Tipo del proyecto — gobierna el copy del estado vacío. */
  tipo: string;
  /** Fecha de arranque ISO (YYYY-MM-DD) para poblar la plantilla. Si es
   *  null, se usa la fecha de hoy. */
  fechaArranque: string | null;
  empresaId: string;
  empresaSlug: EmpresaSlug;
  puedeAutorizar?: boolean;
  /** Muestra el banner "Marcar histórico" (típicamente solo desarrollo). */
  mostrarBannerHistorico?: boolean;
  /** Reporta las tareas + estado de carga al padre (para el gate del
   *  anteproyecto). Memoizar en el caller para evitar refetch. */
  onChecklistState?: (s: { tareas: ProyectoTarea[]; loading: boolean }) => void;
}) {
  const [tareas, setTareas] = useState<ProyectoTarea[]>([]);
  const [dependencias, setDependencias] = useState<TareaDep[]>([]);
  const [pasos, setPasos] = useState<PasoRow[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [populateError, setPopulateError] = useState<string | null>(null);
  const [histPending, startHistTransition] = useTransition();
  const [histError, setHistError] = useState<string | null>(null);
  const [confirmingHist, setConfirmingHist] = useState(false);

  const loading = loadedId !== proyectoId;

  const fetchExtras = useCallback(async (id: string) => {
    const supabase = createSupabaseBrowserClient();
    const tareasRes = await supabase
      .schema('dilesa')
      .from('proyecto_tareas')
      .select(
        'id, titulo, descripcion, estado, orden, tipo_snapshot, subtipo_snapshot, entidad_responsable_snapshot, obligatoriedad_snapshot, requiere_archivo_snapshot, fecha_objetivo_inicio, fecha_objetivo_fin, fecha_completada, resultado_monto, resultado_documento_url, plantilla_tarea_id'
      )
      .eq('proyecto_id', id)
      .is('deleted_at', null)
      .order('orden');

    // Dependencias + pasos por IN sobre los IDs de las tareas. Sin embed
    // PostgREST: si la query falla, `.data` queda array vacío consistente.
    const tareaIds =
      Array.isArray(tareasRes.data) && tareasRes.data.length > 0
        ? tareasRes.data.map((t) => t.id as string)
        : [];
    const [depsRes, pasosRes] =
      tareaIds.length === 0
        ? [
            { data: [] as TareaDep[], error: null },
            { data: [] as PasoRow[], error: null },
          ]
        : await Promise.all([
            supabase
              .schema('dilesa')
              .from('proyecto_tareas_dependencias')
              .select('tarea_id, depende_de_tarea_id')
              .in('tarea_id', tareaIds),
            supabase
              .schema('dilesa')
              .from('proyecto_tarea_pasos')
              .select(
                'id, tarea_id, paso, monto, documento_url, fecha, estado, notas, autorizado_at, autorizado_por'
              )
              .in('tarea_id', tareaIds)
              .is('deleted_at', null),
          ]);
    return [tareasRes, depsRes, pasosRes] as const;
  }, []);

  const cargarExtras = useCallback(
    async (id: string) => {
      const [tareasRes, depsRes, pasosRes] = await fetchExtras(id);
      if (tareasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(tareasRes.error, 'No se pudieron cargar las tareas.')
        );
        setTareas([]);
      } else {
        setExtrasError(null);
        setTareas(Array.isArray(tareasRes.data) ? (tareasRes.data as ProyectoTarea[]) : []);
      }
      setDependencias(
        !depsRes.error && Array.isArray(depsRes.data) ? (depsRes.data as TareaDep[]) : []
      );
      setPasos(!pasosRes.error && Array.isArray(pasosRes.data) ? (pasosRes.data as PasoRow[]) : []);
      setLoadedId(id);
    },
    [fetchExtras]
  );

  // Carga inicial / al cambiar de proyecto. setStates dentro del then
  // para no encadenar renders (regla ESLint react-hooks del repo).
  useEffect(() => {
    let activo = true;
    void fetchExtras(proyectoId).then(([tareasRes, depsRes, pasosRes]) => {
      if (!activo) return;
      if (tareasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(tareasRes.error, 'No se pudieron cargar las tareas.')
        );
        setTareas([]);
      } else {
        setExtrasError(null);
        setTareas(Array.isArray(tareasRes.data) ? (tareasRes.data as ProyectoTarea[]) : []);
      }
      setDependencias(
        !depsRes.error && Array.isArray(depsRes.data) ? (depsRes.data as TareaDep[]) : []
      );
      setPasos(!pasosRes.error && Array.isArray(pasosRes.data) ? (pasosRes.data as PasoRow[]) : []);
      setLoadedId(proyectoId);
    });
    return () => {
      activo = false;
    };
  }, [proyectoId, fetchExtras]);

  // Reporta tareas + loading al padre (gate del anteproyecto). Se dispara
  // solo cuando cambian datos reales, no en cada render.
  useEffect(() => {
    onChecklistState?.({ tareas, loading });
  }, [tareas, loading, onChecklistState]);

  const handlePopulate = useCallback(() => {
    setPopulateError(null);
    const fecha = fechaArranque ?? new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      const r = await populatePlantilla(proyectoId, fecha);
      if (!r.ok) {
        setPopulateError(r.error);
      } else {
        await cargarExtras(proyectoId);
      }
    });
  }, [proyectoId, fechaArranque, cargarExtras]);

  const handleMarcarHistorico = useCallback(() => {
    setHistError(null);
    startHistTransition(async () => {
      const r = await marcarTareasHistorico(proyectoId);
      if (!r.ok) {
        setHistError(r.error);
      } else {
        setConfirmingHist(false);
        await cargarExtras(proyectoId);
      }
    });
  }, [proyectoId, cargarExtras]);

  const copy = emptyStateCopy(tipo);
  const noTerminales = contarNoTerminales(tareas);

  return (
    <DetailDrawerSection
      title="Checklist de tareas"
      description={
        loading ? 'Cargando…' : tareas.length === 0 ? copy.titulo : `${tareas.length} tareas`
      }
    >
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : extrasError ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {extrasError}
        </p>
      ) : tareas.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text)]/60">{copy.descripcion}</p>
          <button
            type="button"
            onClick={handlePopulate}
            disabled={pending}
            className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Poblando…' : 'Poblar plantilla canónica'}
          </button>
          {populateError && <p className="text-sm text-red-600/80">{populateError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {mostrarBannerHistorico && noTerminales > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--card)]/60 px-3 py-2">
              {confirmingHist ? (
                <>
                  <span className="text-xs text-[var(--text)]/80">
                    Marcar las {noTerminales} tareas pendientes como completadas (histórico)? Podrás
                    reabrir cualquiera después.
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleMarcarHistorico}
                      disabled={histPending}
                      className="h-8 rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {histPending ? 'Marcando…' : 'Sí, marcar histórico'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingHist(false)}
                      disabled={histPending}
                      className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--card)] disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-[var(--text)]/60">
                    Desarrollo en marcha — {noTerminales} tareas del checklist canónico siguen
                    pendientes. Si ya están superadas, ciérralas en bloque.
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingHist(true)}
                    className="h-8 shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--card)]"
                  >
                    Marcar histórico
                  </button>
                </>
              )}
            </div>
          )}
          {histError && <p className="text-sm text-red-600/80">{histError}</p>}
          <TareasChecklist
            tareas={tareas}
            dependencias={dependencias}
            pasos={pasos}
            empresaId={empresaId}
            empresaSlug={empresaSlug}
            puedeAutorizar={puedeAutorizar}
            onChange={() => void cargarExtras(proyectoId)}
          />
        </div>
      )}
    </DetailDrawerSection>
  );
}
