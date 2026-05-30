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
import { AnteproyectoAnalisisFinanciero } from './anteproyecto-analisis-financiero';
import type { AnalisisFinancieroSnapshot } from './analisis-financiero-types';
import { PlanoAnteproyecto } from './plano-anteproyecto';

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
 * Mapea el row de `dilesa.proyectos` a la shape esperada por
 * `<AnteproyectoAnalisisFinanciero>` (Sprint 4B). Solo proyecta los
 * campos requeridos para mantener el contrato chico.
 */
function toAnalisisSnapshot(p: ProyectoDetalle): AnalisisFinancieroSnapshot {
  return {
    id: p.id,
    area_m2: p.area_m2,
    area_vendible_m2: p.area_vendible_m2,
    areas_verdes_m2: p.areas_verdes_m2,
    area_vialidades_m2: p.area_vialidades_m2,
    lotes_proyectados: p.lotes_proyectados,
    tamano_lote_promedio: p.tamano_lote_promedio,
    clasificacion_inmobiliaria: p.clasificacion_inmobiliaria,
    clasificaciones_inmobiliarias: p.clasificaciones_inmobiliarias,
    costo_terreno: p.costo_terreno,
    valor_predio: p.valor_predio,
    infraestructura_cabecera_necesaria: p.infraestructura_cabecera_necesaria,
    prototipos_referencia: p.prototipos_referencia,
    prototipo_referencia_id: p.prototipo_referencia_id,
    presupuesto_estimado: p.presupuesto_estimado,
    valor_comercial_referencia: p.valor_comercial_referencia,
    costo_urbanizacion_referencia: p.costo_urbanizacion_referencia,
    costo_materiales_referencia: p.costo_materiales_referencia,
    costo_mo_referencia: p.costo_mo_referencia,
    registro_ruv_referencia: p.registro_ruv_referencia,
    seguro_calidad_referencia: p.seguro_calidad_referencia,
    costo_comercializacion_referencia: p.costo_comercializacion_referencia,
    valor_comercial_proyecto: p.valor_comercial_proyecto,
    costo_urbanizacion: p.costo_urbanizacion,
    costo_materiales_proyecto: p.costo_materiales_proyecto,
    costo_mo: p.costo_mo,
    registro_ruv_proyecto: p.registro_ruv_proyecto,
    seguro_calidad_proyecto: p.seguro_calidad_proyecto,
    costo_comercializacion: p.costo_comercializacion,
  };
}

/** Tipo del catálogo de productos disponibles para el selector. */
type ProductoCatalogo = {
  id: string;
  nombre: string;
  proyecto_nombre: string | null;
  valor_comercial_referencia: number | null;
};

/**
 * Sprint 4A: el gate de promoción ya no se basa en una tarea Comité
 * (eliminada). En su lugar, se requiere que:
 *   1) El usuario sea admin global O tenga rol "Dirección" en la
 *      empresa del anteproyecto. El server action revalida.
 *   2) Todas las tareas obligatorias del anteproyecto estén
 *      `completada`. Esto evita promover sin haber cerrado los
 *      trámites y factibilidades canónicos.
 *   3) El anteproyecto no esté ya convertido.
 *
 * Retorna `puede` (booleano) y `razon` (string para mostrar al usuario
 * cuando no puede). Exportado para tests + reuso.
 */
export function gatePromocion(
  tareas: readonly { estado: string; obligatoriedad_snapshot?: string | null }[],
  ctx: { puedeAutorizar: boolean; yaConvertido: boolean }
): { puede: boolean; razon: string } {
  if (ctx.yaConvertido) {
    return { puede: false, razon: 'Este anteproyecto ya fue convertido.' };
  }
  if (!ctx.puedeAutorizar) {
    return {
      puede: false,
      razon: 'Solo dirección puede autorizar y promover a desarrollo.',
    };
  }
  const obligatoriasPendientes = tareas.filter(
    (t) => (t.obligatoriedad_snapshot ?? '') === 'obligatoria' && t.estado !== 'completada'
  );
  if (obligatoriasPendientes.length > 0) {
    return {
      puede: false,
      razon: `Faltan ${obligatoriasPendientes.length} tarea(s) obligatoria(s) por completar.`,
    };
  }
  return { puede: true, razon: 'Listo para autorizar y promover.' };
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

export function AnteproyectoDetalle({
  anteproyecto,
  onAnteproyectoChange,
}: {
  anteproyecto: ProyectoDetalle | null;
  /** Callback opcional para refrescar el row cuando un hijo (ej.
   *  PlanoAnteproyecto al aplicar AI) muta columnas del proyecto. */
  onAnteproyectoChange?: () => void | Promise<void>;
}) {
  const [tareas, setTareas] = useState<ProyectoTarea[]>([]);
  const [dependencias, setDependencias] = useState<TareaDep[]>([]);
  const [pasos, setPasos] = useState<PasoRow[]>([]);
  const { data: effectiveUser } = useEffectiveUser();
  // Sprint 4A: puede autorizar si es admin global, O tiene rol
  // "Dirección" en la empresa DILESA. Este componente solo se usa para
  // anteproyectos DILESA, por eso comparamos contra DILESA_EMPRESA_ID
  // directo.
  const puedeAutorizar =
    !!effectiveUser?.isAdmin ||
    (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
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

  // Catálogo de productos DILESA con valor_comercial_referencia
  // poblado — pull-eables al seleccionarlos en el selector de
  // prototipo referencia. Se carga 1 sola vez por mount.
  useEffect(() => {
    let activo = true;
    const supabase = createSupabaseBrowserClient();
    void supabase
      .schema('dilesa')
      .from('productos')
      .select(
        'id, nombre, valor_comercial_referencia, proyecto:proyectos!productos_proyecto_id_fkey(nombre)'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('nombre')
      .then(({ data, error }) => {
        if (!activo || error) return;
        const norm: ProductoCatalogo[] = (
          (data ?? []) as unknown as Array<{
            id: string;
            nombre: string;
            valor_comercial_referencia: number | null;
            proyecto: { nombre: string } | null;
          }>
        ).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          proyecto_nombre: p.proyecto?.nombre ?? null,
          valor_comercial_referencia: p.valor_comercial_referencia,
        }));
        setProductosCatalogo(norm);
      });
    return () => {
      activo = false;
    };
  }, []);

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

  const yaConvertido = anteproyecto.estado === 'completado';
  const gate = gatePromocion(tareas, { puedeAutorizar, yaConvertido });
  const puedePromover = gate.puede && !loadingExtras;

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

  // Sprint 4B refinamiento: las antes-ficha-física/costos/análisis
  // se eliminaron — el componente `<AnteproyectoAnalisisFinanciero>`
  // arriba cubre toda esa información (sin duplicar). `deriveAnalisis`
  // sigue exportado para tests y consumo externo.

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

      <AnteproyectoAnalisisFinanciero
        snapshot={toAnalisisSnapshot(anteproyecto)}
        productosDisponibles={productosCatalogo}
        onChange={() => void cargarExtras(anteproyecto.id)}
      />

      <PlanoAnteproyecto
        proyectoId={anteproyecto.id}
        empresaId={DILESA_EMPRESA_ID}
        empresaSlug="dilesa"
        onAnalisisAplicado={() => {
          void onAnteproyectoChange?.();
        }}
      />

      {/* Ficha física + Costos estimados + Análisis derivado quedaron
          reemplazadas por la sección Análisis Financiero arriba
          (Sprint 4B refinamiento — Beto: "la ficha ya puede salir
          sobrando"). */}

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

      {/* La sección "Presupuesto" (partidas presupuestales del Sprint 2)
          se eliminó en Sprint 4E refinamiento. El flujo de entrada
          original — capturar monto en tareas de cotización — ya no
          existe: las 4 tareas de cotización + comité se eliminaron en
          Sprint 4A. El análisis financiero del Sprint 4B captura
          todos los costos (urbanización, materiales, MO, RUV, seguro,
          comercialización) con su comparativo referencia vs proyecto.
          La tabla `dilesa.proyecto_presupuesto_partidas` se mantiene
          para histórico y para uso en desarrollo. */}

      <DetailDrawerSection title="Autorización y promoción a desarrollo" description={gate.razon}>
        {promoteSuccess ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="font-medium">Ejecución autorizada y anteproyecto promovido.</div>
            <div className="mt-1 text-xs">
              Nuevo desarrollo creado con ID <code>{promoteSuccess}</code>. El anteproyecto queda
              como histórico (estado completado). Cambia a la tab Activos para verlo.
            </div>
          </div>
        ) : confirmingPromote ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-900">
              Al confirmar, como dirección autorizas la ejecución del proyecto.
            </div>
            <div className="text-sm text-amber-900/90">
              Se creará un nuevo proyecto con <strong>tipo desarrollo</strong> apuntando a este
              anteproyecto como predecesor. Se copiarán las tareas trabajadas (en curso o
              completadas con aplicación desarrollo/ambas) y las partidas presupuestales autorizadas
              (con monto aprobado snapshot). Este anteproyecto queda como histórico inmutable.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePromote}
                disabled={promotePending}
                className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {promotePending
                  ? 'Autorizando y promoviendo…'
                  : 'Confirmar autorización y promover'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingPromote(false)}
                disabled={promotePending}
                className="h-9 rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : puedeAutorizar ? (
          <button
            type="button"
            onClick={() => setConfirmingPromote(true)}
            disabled={!puedePromover}
            className="h-9 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!puedePromover ? gate.razon : undefined}
          >
            Autorizar y promover a desarrollo
          </button>
        ) : (
          <div className="text-sm text-[var(--muted-text)]">
            Solo dirección puede autorizar y promover este anteproyecto.
          </div>
        )}
        {promoteError && <p className="mt-2 text-sm text-red-600/80">{promoteError}</p>}
      </DetailDrawerSection>
    </div>
  );
}
