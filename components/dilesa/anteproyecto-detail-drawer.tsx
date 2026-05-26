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
import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { populatePlantilla } from '@/app/dilesa/proyectos/anteproyectos/actions';
import { type ProyectoDetalle, ESTADO_TONE, ESTADO_LABEL } from './proyecto-detail-drawer';

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

type Partida = {
  id: string;
  partida: string;
  monto_estimado: number | null;
  monto_aprobado: number | null;
  estado: string;
};

const TAREA_ESTADO_TONE: Record<string, BadgeTone> = {
  pendiente: 'neutral',
  bloqueada: 'warning',
  en_curso: 'info',
  completada: 'success',
  cancelada: 'neutral',
};
const TAREA_ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  bloqueada: 'Bloqueada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};
const PARTIDA_ESTADO_TONE: Record<string, BadgeTone> = {
  preliminar: 'neutral',
  autorizada: 'info',
  planeada: 'info',
  en_ejercicio: 'warning',
  cerrada: 'success',
};

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

export function AnteproyectoDetailDrawer({
  anteproyecto,
  open,
  onOpenChange,
}: {
  anteproyecto: ProyectoDetalle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tareas, setTareas] = useState<ProyectoTarea[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [populateError, setPopulateError] = useState<string | null>(null);
  // Derivamos loading desde `loadedId` para evitar setState síncrono en el
  // effect (ver eslint react-hooks): si el drawer está abierto y el id del
  // proyecto cargado no coincide con el actual, estamos cargando.
  const loadingExtras = open && anteproyecto != null && loadedId !== anteproyecto.id;

  const fetchExtras = useCallback((proyectoId: string) => {
    const supabase = createSupabaseBrowserClient();
    return Promise.all([
      supabase
        .schema('dilesa')
        .from('proyecto_tareas')
        .select(
          'id, titulo, estado, orden, tipo_snapshot, subtipo_snapshot, entidad_responsable_snapshot, obligatoriedad_snapshot, requiere_archivo_snapshot, fecha_objetivo_inicio, fecha_objetivo_fin, fecha_completada, resultado_monto, resultado_documento_url, plantilla_tarea_id'
        )
        .eq('proyecto_id', proyectoId)
        .is('deleted_at', null)
        .order('orden'),
      supabase
        .schema('dilesa')
        .from('proyecto_presupuesto_partidas')
        .select('id, partida, monto_estimado, monto_aprobado, estado')
        .eq('proyecto_id', proyectoId)
        .is('deleted_at', null)
        .order('partida'),
    ]);
  }, []);

  const cargarExtras = useCallback(
    async (proyectoId: string) => {
      const [tareasRes, partidasRes] = await fetchExtras(proyectoId);
      if (tareasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(tareasRes.error, 'No se pudieron cargar las tareas.')
        );
        setTareas([]);
      } else {
        setExtrasError(null);
        setTareas((tareasRes.data ?? []) as ProyectoTarea[]);
      }
      if (partidasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(partidasRes.error, 'No se pudieron cargar las partidas.')
        );
        setPartidas([]);
      } else {
        setPartidas((partidasRes.data ?? []) as Partida[]);
      }
      setLoadedId(proyectoId);
    },
    [fetchExtras]
  );

  // Carga inicial: setStates van dentro del then para no triggerear renders
  // en cascada (regla ESLint react-hooks/exhaustive-deps stricter).
  useEffect(() => {
    if (!open || !anteproyecto) return;
    let activo = true;
    void fetchExtras(anteproyecto.id).then(([tareasRes, partidasRes]) => {
      if (!activo) return;
      if (tareasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(tareasRes.error, 'No se pudieron cargar las tareas.')
        );
        setTareas([]);
      } else {
        setExtrasError(null);
        setTareas((tareasRes.data ?? []) as ProyectoTarea[]);
      }
      if (partidasRes.error) {
        setExtrasError(
          getSupabaseErrorMessage(partidasRes.error, 'No se pudieron cargar las partidas.')
        );
        setPartidas([]);
      } else {
        setPartidas((partidasRes.data ?? []) as Partida[]);
      }
      setLoadedId(anteproyecto.id);
    });
    return () => {
      activo = false;
    };
  }, [open, anteproyecto, fetchExtras]);

  if (!anteproyecto) return null;

  const analisis = deriveAnalisis(anteproyecto);
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
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={anteproyecto.nombre}
      meta={
        <>
          <Badge tone="info">Anteproyecto</Badge>
          <Badge tone={ESTADO_TONE[anteproyecto.estado] ?? 'neutral'}>
            {ESTADO_LABEL[anteproyecto.estado] ?? anteproyecto.estado}
          </Badge>
        </>
      }
    >
      <DetailDrawerContent>
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
            <p className="whitespace-pre-line text-sm text-[var(--text)]/80">
              {anteproyecto.notas}
            </p>
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
                arranque + grafo de dependencias + calendario hábil MX.
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
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-[var(--text)]/50">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-4 text-left">Tarea</th>
                    <th className="py-2 pr-4 text-left">Estado</th>
                    <th className="py-2 pr-4 text-left">Tipo</th>
                    <th className="py-2 pr-4 text-left">Entidad</th>
                    <th className="py-2 pr-4 text-left">Inicio</th>
                    <th className="py-2 pr-4 text-left">Fin</th>
                    <th className="py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border)]/40">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-[var(--text)]">{t.titulo}</div>
                        {t.obligatoriedad_snapshot &&
                          t.obligatoriedad_snapshot !== 'obligatoria' && (
                            <div className="text-xs text-[var(--text)]/50">
                              {t.obligatoriedad_snapshot}
                            </div>
                          )}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={TAREA_ESTADO_TONE[t.estado] ?? 'neutral'}>
                          {TAREA_ESTADO_LABEL[t.estado] ?? t.estado}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-[var(--text)]/70">
                        {t.tipo_snapshot}
                        {t.subtipo_snapshot ? ` · ${t.subtipo_snapshot}` : ''}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text)]/70">
                        {t.entidad_responsable_snapshot ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text)]/70">
                        {t.fecha_objetivo_inicio ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text)]/70">
                        {t.fecha_objetivo_fin ?? '—'}
                      </td>
                      <td className="py-2 text-right text-[var(--text)]/70">
                        {t.resultado_monto != null ? moneyFmt.format(t.resultado_monto) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailDrawerSection>

        <DetailDrawerSection
          title="Presupuestos preliminares"
          description={
            loadingExtras
              ? 'Cargando…'
              : partidas.length === 0
                ? 'Sin partidas capturadas todavía.'
                : `${partidas.length} partidas`
          }
        >
          {loadingExtras ? (
            <Skeleton className="h-16 w-full" />
          ) : partidas.length === 0 ? (
            <p className="text-sm text-[var(--text)]/60">
              La captura inline + workflow de autorización viven en el próximo entregable. Cuando
              una tarea de cotización registra `resultado_monto`, una partida preliminar se vincula
              con ella aquí.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-[var(--text)]/50">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-4 text-left">Partida</th>
                    <th className="py-2 pr-4 text-left">Estado</th>
                    <th className="py-2 pr-4 text-right">Estimado</th>
                    <th className="py-2 text-right">Aprobado</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--border)]/40">
                      <td className="py-2 pr-4 font-medium text-[var(--text)]">{p.partida}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={PARTIDA_ESTADO_TONE[p.estado] ?? 'neutral'}>{p.estado}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right text-[var(--text)]/70">
                        {p.monto_estimado != null ? moneyFmt.format(p.monto_estimado) : '—'}
                      </td>
                      <td className="py-2 text-right text-[var(--text)]/70">
                        {p.monto_aprobado != null ? moneyFmt.format(p.monto_aprobado) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {extrasError && <p className="mt-2 text-sm text-red-600/80">{extrasError}</p>}
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
