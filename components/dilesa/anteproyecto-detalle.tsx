'use client';

/**
 * AnteproyectoDetailDrawer — detalle de un anteproyecto DILESA.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 2 (ficha + análisis)
 * + Sprint 3 (checklist + presupuestos preliminares).
 *
 * Secciones:
 * - Ficha física (área, lotes, fechas)
 * - Costos estimados (4 partidas + delta vs presupuesto)
 * - Análisis derivado (aprovechamiento, costo/lote, costo/m² vendible)
 * - Notas (si hay)
 * - Checklist de tareas (instanciadas desde plantilla canónica)
 * - Presupuestos preliminares
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { DetailDrawerSection } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  populatePlantilla,
  promoteAnteproyecto,
} from '@/app/dilesa/proyectos/anteproyectos/actions';
import { type ProyectoDetalle, ESTADO_TONE, ESTADO_LABEL } from './proyecto-detalle';
import { TareasChecklist, type PasoRow } from './tareas-checklist';
import { PartidasPresupuestales, type PartidaRow } from './partidas-presupuestales';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { useEffectiveUser } from '@/components/providers';

const numberFmt = new Intl.NumberFormat('es-MX');
const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const pctFmt = new Intl.NumberFormat('es-MX', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function fmtM2(n: number | null): string | null {
  return n == null ? null : `${numberFmt.format(n)} m²`;
}
function fmtMoney(n: number | null): string | null {
  return n == null ? null : moneyFmt.format(n);
}
function fmtInt(n: number | null): string | null {
  return n == null ? null : numberFmt.format(n);
}
function fmtPct(n: number | null): string | null {
  return n == null ? null : pctFmt.format(n);
}
function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

type ProyectoTarea = {
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

type TareaDep = { tarea_id: string; depende_de_tarea_id: string };

type Partida = PartidaRow;

/**
 * Detecta el gate de promoción: la tarea "Aprobación de Comité de
 * Inversión" debe existir Y estar en `estado='completada'`. La RPC
 * server-side valida lo mismo — esto es solo UX preventiva para no
 * mostrar un botón que va a fallar.
 *
 * Exportado para tests + reuso.
 */
export function gateComitePromocion(tareas: readonly { titulo: string; estado: string }[]): {
  existe: boolean;
  completado: boolean;
} {
  const gate = tareas.find(
    (t) =>
      t.titulo.toLowerCase().includes('comité de inversión') &&
      t.titulo.toLowerCase().includes('aprobación')
  );
  return {
    existe: gate !== undefined,
    completado: gate?.estado === 'completada',
  };
}

/**
 * Indicadores derivados client-side desde las columnas de
 * `dilesa.proyectos`. Se exportan para reuso en tests + KPIs agregados.
 */
export function deriveAnalisis(p: ProyectoDetalle) {
  const costoTerreno = p.costo_terreno ?? 0;
  const costoUrb = p.costo_urbanizacion ?? 0;
  const costoConst = p.costo_construccion ?? 0;
  const costoCom = p.costo_comercializacion ?? 0;
  const hasCostos = [
    p.costo_terreno,
    p.costo_urbanizacion,
    p.costo_construccion,
    p.costo_comercializacion,
  ].some((c) => c != null);
  const costoTotal = hasCostos ? costoTerreno + costoUrb + costoConst + costoCom : null;

  const aprovechamiento = p.area_m2 && p.area_vendible_m2 ? p.area_vendible_m2 / p.area_m2 : null;
  const pctVerdes = p.area_m2 && p.areas_verdes_m2 ? p.areas_verdes_m2 / p.area_m2 : null;

  const costoPorLote =
    costoTotal != null && p.lotes_proyectados ? costoTotal / p.lotes_proyectados : null;
  const costoPorM2Vendible =
    costoTotal != null && p.area_vendible_m2 ? costoTotal / p.area_vendible_m2 : null;

  const deltaPresupuesto =
    p.presupuesto_estimado != null && costoTotal != null
      ? p.presupuesto_estimado - costoTotal
      : null;

  return {
    costoTotal,
    aprovechamiento,
    pctVerdes,
    costoPorLote,
    costoPorM2Vendible,
    deltaPresupuesto,
  };
}

export function AnteproyectoDetalle({ anteproyecto }: { anteproyecto: ProyectoDetalle | null }) {
  const [tareas, setTareas] = useState<ProyectoTarea[]>([]);
  const [dependencias, setDependencias] = useState<TareaDep[]>([]);
  const [pasos, setPasos] = useState<PasoRow[]>([]);
  const { data: effectiveUser } = useEffectiveUser();
  const puedeAutorizar = !!effectiveUser?.isAdmin;
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [populateError, setPopulateError] = useState<string | null>(null);
  const [promotePending, startPromoteTransition] = useTransition();
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);
  const [confirmingPromote, setConfirmingPromote] = useState(false);
  // Derivamos loading desde `loadedId` para evitar setState síncrono en el
  // effect (ver eslint react-hooks): si el drawer está abierto y el id del
  // proyecto cargado no coincide con el actual, estamos cargando.
  const loadingExtras = anteproyecto != null && loadedId !== anteproyecto.id;

  const fetchExtras = useCallback(async (proyectoId: string) => {
    const supabase = createSupabaseBrowserClient();
    // Tareas + partidas en paralelo. Las dependencias requieren los IDs de
    // tareas como input, por lo que viven en una segunda fase.
    const [tareasRes, partidasRes] = await Promise.all([
      supabase
        .schema('dilesa')
        .from('proyecto_tareas')
        .select(
          'id, titulo, descripcion, estado, orden, tipo_snapshot, subtipo_snapshot, entidad_responsable_snapshot, obligatoriedad_snapshot, requiere_archivo_snapshot, fecha_objetivo_inicio, fecha_objetivo_fin, fecha_completada, resultado_monto, resultado_documento_url, plantilla_tarea_id'
        )
        .eq('proyecto_id', proyectoId)
        .is('deleted_at', null)
        .order('orden'),
      supabase
        .schema('dilesa')
        .from('proyecto_presupuesto_partidas')
        .select(
          'id, partida, descripcion, monto_estimado, monto_aprobado, monto_ejercido, fuente, estado, tarea_origen_id, autorizado_at'
        )
        .eq('proyecto_id', proyectoId)
        .is('deleted_at', null)
        .order('partida'),
    ]);

    // Dependencias + pasos por IN sobre los IDs de las tareas del proyecto.
    // Patrón sin embed PostgREST: si la query falla (RLS, parsing del embed),
    // el shape de `.data` queda consistentemente array vacío en vez de null
    // wrapped en algo raro. Aceptamos el round-trip extra.
    const tareaIds =
      Array.isArray(tareasRes.data) && tareasRes.data.length > 0
        ? tareasRes.data.map((t) => t.id as string)
        : [];
    const [depsRes, pasosRes] =
      tareaIds.length === 0
        ? [
            { data: [] as Array<{ tarea_id: string; depende_de_tarea_id: string }>, error: null },
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
    return [tareasRes, partidasRes, depsRes, pasosRes] as const;
  }, []);

  const cargarExtras = useCallback(
    async (proyectoId: string) => {
      const [tareasRes, partidasRes, depsRes, pasosRes] = await fetchExtras(proyectoId);
      if (tareasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(tareasRes.error, 'No se pudieron cargar las tareas.')
        );
        setTareas([]);
      } else {
        setExtrasError(null);
        setTareas(Array.isArray(tareasRes.data) ? (tareasRes.data as ProyectoTarea[]) : []);
      }
      if (partidasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(partidasRes.error, 'No se pudieron cargar las partidas.')
        );
        setPartidas([]);
      } else {
        setPartidas(Array.isArray(partidasRes.data) ? (partidasRes.data as Partida[]) : []);
      }
      if (!depsRes.error && Array.isArray(depsRes.data)) {
        setDependencias(depsRes.data as TareaDep[]);
      } else {
        setDependencias([]);
      }
      if (!pasosRes.error && Array.isArray(pasosRes.data)) {
        setPasos(pasosRes.data as PasoRow[]);
      } else {
        setPasos([]);
      }
      setLoadedId(proyectoId);
    },
    [fetchExtras]
  );

  // Carga inicial: setStates van dentro del then para no triggerear renders
  // en cascada (regla ESLint react-hooks/exhaustive-deps stricter).
  useEffect(() => {
    if (!anteproyecto) return;
    let activo = true;
    void fetchExtras(anteproyecto.id).then(([tareasRes, partidasRes, depsRes, pasosRes]) => {
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
      if (partidasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(partidasRes.error, 'No se pudieron cargar las partidas.')
        );
        setPartidas([]);
      } else {
        setPartidas(Array.isArray(partidasRes.data) ? (partidasRes.data as Partida[]) : []);
      }
      if (!depsRes.error && Array.isArray(depsRes.data)) {
        setDependencias(depsRes.data as TareaDep[]);
      } else {
        setDependencias([]);
      }
      if (!pasosRes.error && Array.isArray(pasosRes.data)) {
        setPasos(pasosRes.data as PasoRow[]);
      } else {
        setPasos([]);
      }
      setLoadedId(anteproyecto.id);
    });
    return () => {
      activo = false;
    };
  }, [anteproyecto, fetchExtras]);

  if (!anteproyecto) return null;

  const analisis = deriveAnalisis(anteproyecto);
  const gate = gateComitePromocion(tareas);
  const yaConvertido = anteproyecto.estado === 'completado';
  const puedePromover = gate.completado && !yaConvertido && !loadingExtras;

  const handlePromote = () => {
    setPromoteError(null);
    setPromoteSuccess(null);
    startPromoteTransition(async () => {
      const r = await promoteAnteproyecto(anteproyecto.id);
      if (!r.ok) {
        setPromoteError(r.error);
        setConfirmingPromote(false);
      } else {
        setPromoteSuccess(r.proyectoId);
        setConfirmingPromote(false);
      }
    });
  };

  const handlePopulate = () => {
    setPopulateError(null);
    const fecha = anteproyecto.fecha_inicio ?? new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      const r = await populatePlantilla(anteproyecto.id, fecha);
      if (!r.ok) {
        setPopulateError(r.error);
      } else {
        await cargarExtras(anteproyecto.id);
      }
    });
  };

  const fichaFisica: { label: string; value: string }[] = (
    [
      ['Clave interna', anteproyecto.clave_interna],
      ['Inicio', fmtFecha(anteproyecto.fecha_inicio)],
      ['Fin estimado', fmtFecha(anteproyecto.fecha_fin_estimada)],
      ['Licencia de fraccionamiento', fmtFecha(anteproyecto.fecha_licencia)],
      ['Área total', fmtM2(anteproyecto.area_m2)],
      ['Área vendible', fmtM2(anteproyecto.area_vendible_m2)],
      ['Áreas verdes', fmtM2(anteproyecto.areas_verdes_m2)],
      ['Lotes proyectados', fmtInt(anteproyecto.lotes_proyectados)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null)
    .map(([label, value]) => ({ label, value }));

  const fichaCostos: { label: string; value: string }[] = (
    [
      ['Presupuesto estimado', fmtMoney(anteproyecto.presupuesto_estimado)],
      ['Costo de terreno', fmtMoney(anteproyecto.costo_terreno)],
      ['Costo de urbanización', fmtMoney(anteproyecto.costo_urbanizacion)],
      ['Costo de construcción', fmtMoney(anteproyecto.costo_construccion)],
      ['Costo de comercialización', fmtMoney(anteproyecto.costo_comercializacion)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null)
    .map(([label, value]) => ({ label, value }));

  const fichaAnalisis: { label: string; value: string }[] = (
    [
      ['Costo total (suma de partidas)', fmtMoney(analisis.costoTotal)],
      ['Aprovechamiento (vendible/total)', fmtPct(analisis.aprovechamiento)],
      ['% Áreas verdes', fmtPct(analisis.pctVerdes)],
      ['Costo por lote', fmtMoney(analisis.costoPorLote)],
      ['Costo por m² vendible', fmtMoney(analisis.costoPorM2Vendible)],
    ] as [string, string | null][]
  )
    .filter((r): r is [string, string] => r[1] != null)
    .map(([label, value]) => ({ label, value }));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
          {anteproyecto.nombre}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">Anteproyecto</Badge>
          <Badge tone={ESTADO_TONE[anteproyecto.estado] ?? 'neutral'}>
            {ESTADO_LABEL[anteproyecto.estado] ?? anteproyecto.estado}
          </Badge>
        </div>
      </header>

      <DetailDrawerSection title="Ficha física" divider={false}>
        {fichaFisica.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fichaFisica.map((r) => (
              <div key={r.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  {r.label}
                </dt>
                <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-[var(--text)]/60">Sin datos físicos capturados todavía.</p>
        )}
      </DetailDrawerSection>

      {fichaCostos.length > 0 && (
        <DetailDrawerSection title="Costos estimados">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fichaCostos.map((r) => (
              <div key={r.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  {r.label}
                </dt>
                <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
              </div>
            ))}
          </dl>
          {analisis.deltaPresupuesto != null && Math.abs(analisis.deltaPresupuesto) > 1 && (
            <p className="mt-3 text-xs text-[var(--text)]/60">
              {analisis.deltaPresupuesto > 0
                ? `El presupuesto excede la suma de partidas en ${fmtMoney(analisis.deltaPresupuesto)} (holgura).`
                : `La suma de partidas excede el presupuesto en ${fmtMoney(Math.abs(analisis.deltaPresupuesto))} (sobre-asignación).`}
            </p>
          )}
        </DetailDrawerSection>
      )}

      {fichaAnalisis.length > 0 && (
        <DetailDrawerSection title="Análisis derivado">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fichaAnalisis.map((r) => (
              <div key={r.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
                  {r.label}
                </dt>
                <dd className="mt-0.5 text-sm text-[var(--text)]">{r.value}</dd>
              </div>
            ))}
          </dl>
        </DetailDrawerSection>
      )}

      {anteproyecto.notas ? (
        <DetailDrawerSection title="Notas">
          <p className="whitespace-pre-line text-sm text-[var(--text)]/80">{anteproyecto.notas}</p>
        </DetailDrawerSection>
      ) : null}

      <DetailDrawerSection
        title="Checklist de tareas"
        description={
          loadingExtras
            ? 'Cargando…'
            : tareas.length === 0
              ? 'Sin tareas instanciadas todavía.'
              : `${tareas.length} tareas`
        }
      >
        {loadingExtras ? (
          <Skeleton className="h-20 w-full" />
        ) : tareas.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text)]/60">
              Las 16 tareas canónicas del anteproyecto (incluyendo gate &quot;Comité de
              Inversión&quot;) se instancian con fechas objetivo calculadas desde la fecha de
              arranque + grafo de dependencias + calendario hábil MX. Sprint 1 de
              `dilesa-proyectos-checklist-inline` automatiza esto al crear el proyecto desde el
              formulario; los 13 proyectos vivos se backfillean con un script one-shot.
            </p>
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
          <TareasChecklist
            tareas={tareas}
            dependencias={dependencias}
            pasos={pasos}
            empresaId={DILESA_EMPRESA_ID}
            empresaSlug="dilesa"
            puedeAutorizar={puedeAutorizar}
            onChange={() => void cargarExtras(anteproyecto.id)}
          />
        )}
      </DetailDrawerSection>

      <DetailDrawerSection
        title="Presupuesto"
        description={
          loadingExtras
            ? 'Cargando…'
            : partidas.length === 0
              ? 'Captura un monto en una tarea de cotización para iniciar.'
              : `${partidas.length} ${partidas.length === 1 ? 'partida' : 'partidas'}`
        }
      >
        {loadingExtras ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <PartidasPresupuestales
            partidas={partidas}
            onChange={() => void cargarExtras(anteproyecto.id)}
          />
        )}
        {extrasError && <p className="mt-2 text-sm text-red-600/80">{extrasError}</p>}
      </DetailDrawerSection>

      <DetailDrawerSection
        title="Promoción a desarrollo"
        description={
          yaConvertido
            ? 'Este anteproyecto ya fue convertido.'
            : gate.completado
              ? 'Listo para promover.'
              : gate.existe
                ? 'Pendiente: la tarea "Aprobación de Comité de Inversión" no está completada.'
                : 'Pendiente: pobla la plantilla canónica para tener el gate.'
        }
      >
        {promoteSuccess ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="font-medium">Anteproyecto promovido.</div>
            <div className="mt-1 text-xs">
              Nuevo desarrollo creado con ID <code>{promoteSuccess}</code>. El anteproyecto queda
              como histórico (estado completado). Cambia a la tab Activos para verlo.
            </div>
          </div>
        ) : confirmingPromote ? (
          <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-sm text-[var(--text)]">
              Al promover se creará un nuevo proyecto con <strong>tipo desarrollo</strong> apuntando
              a este anteproyecto como predecesor. Se llevarán las tareas trabajadas (estado en
              curso o completada con aplicación desarrollo/ambas) y las partidas presupuestales
              autorizadas (con monto aprobado snapshot). Este anteproyecto queda como histórico
              inmutable.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePromote}
                disabled={promotePending}
                className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {promotePending ? 'Promoviendo…' : 'Confirmar promoción'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingPromote(false)}
                disabled={promotePending}
                className="h-9 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingPromote(true)}
            disabled={!puedePromover}
            className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Promover a desarrollo
          </button>
        )}
        {promoteError && <p className="mt-2 text-sm text-red-600/80">{promoteError}</p>}
      </DetailDrawerSection>
    </div>
  );
}
