'use client';

/**
 * AnteproyectoDetalle — detalle de un anteproyecto DILESA.
 *
 * Secciones (en orden de render):
 * - Análisis financiero (`<AnteproyectoAnalisisFinanciero>`)
 * - Plano del anteproyecto + análisis IA (`<PlanoAnteproyecto>`)
 * - Notas (si hay)
 * - Checklist de tareas (`<ProyectoChecklist>`, componente compartido
 *   con el detalle del desarrollo desde el Sprint 4 de
 *   `dilesa-proyectos-checklist-inline`)
 * - Autorización y promoción a desarrollo (gate `gatePromocion`)
 *
 * El gate de promoción depende del estado de las tareas obligatorias,
 * que `<ProyectoChecklist>` reporta vía `onChecklistState`.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { DetailDrawerSection } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { promoteAnteproyecto } from '@/app/dilesa/proyectos/anteproyectos/actions';
import { type ProyectoDetalle, ESTADO_TONE, ESTADO_LABEL } from './proyecto-detalle';
import { ProyectoChecklist, type ProyectoTarea } from './proyecto-checklist';
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
  costo_urbanizacion_referencia: number | null;
  costo_materiales_referencia: number | null;
  costo_mo_referencia: number | null;
  registro_ruv_referencia: number | null;
  seguro_calidad_referencia: number | null;
  costo_comercializacion_referencia: number | null;
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
  const { data: effectiveUser } = useEffectiveUser();
  // Sprint 4A: puede autorizar si es admin global, O tiene rol
  // "Dirección" en la empresa DILESA. Este componente solo se usa para
  // anteproyectos DILESA, por eso comparamos contra DILESA_EMPRESA_ID
  // directo.
  const puedeAutorizar =
    !!effectiveUser?.isAdmin ||
    (effectiveUser?.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);
  const [productosCatalogo, setProductosCatalogo] = useState<ProductoCatalogo[]>([]);
  // El fetch del checklist (tareas/deps/pasos) vive en <ProyectoChecklist>
  // (Sprint 4 — espejar a desarrollo). El padre solo necesita las tareas +
  // loading para el gate de promoción, que el hijo reporta vía
  // onChecklistState.
  const [checklist, setChecklist] = useState<{ tareas: ProyectoTarea[]; loading: boolean }>({
    tareas: [],
    loading: true,
  });
  const [promotePending, startPromoteTransition] = useTransition();
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);
  const [confirmingPromote, setConfirmingPromote] = useState(false);

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
        'id, nombre, valor_comercial_referencia, costo_urbanizacion_referencia, costo_materiales_referencia, costo_mo_referencia, registro_ruv_referencia, seguro_calidad_referencia, costo_comercializacion_referencia, proyecto:proyectos!productos_proyecto_id_fkey(nombre)'
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
            costo_urbanizacion_referencia: number | null;
            costo_materiales_referencia: number | null;
            costo_mo_referencia: number | null;
            registro_ruv_referencia: number | null;
            seguro_calidad_referencia: number | null;
            costo_comercializacion_referencia: number | null;
            proyecto: { nombre: string } | null;
          }>
        ).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          proyecto_nombre: p.proyecto?.nombre ?? null,
          valor_comercial_referencia: p.valor_comercial_referencia,
          costo_urbanizacion_referencia: p.costo_urbanizacion_referencia,
          costo_materiales_referencia: p.costo_materiales_referencia,
          costo_mo_referencia: p.costo_mo_referencia,
          registro_ruv_referencia: p.registro_ruv_referencia,
          seguro_calidad_referencia: p.seguro_calidad_referencia,
          costo_comercializacion_referencia: p.costo_comercializacion_referencia,
        }));
        setProductosCatalogo(norm);
      });
    return () => {
      activo = false;
    };
  }, []);

  // Callback estable: <ProyectoChecklist> reporta sus tareas + loading sin
  // redisparar su propio fetch. Alimenta el gate de promoción.
  const handleChecklistState = useCallback(
    (s: { tareas: ProyectoTarea[]; loading: boolean }) => setChecklist(s),
    []
  );

  if (!anteproyecto) return null;

  const yaConvertido = anteproyecto.estado === 'completado';
  const gate = gatePromocion(checklist.tareas, { puedeAutorizar, yaConvertido });
  const puedePromover = gate.puede && !checklist.loading;

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
        onChange={() => void onAnteproyectoChange?.()}
      />

      <PlanoAnteproyecto
        proyectoId={anteproyecto.id}
        empresaId={DILESA_EMPRESA_ID}
        empresaSlug="dilesa"
        onAnalisisAplicado={() => {
          void onAnteproyectoChange?.();
        }}
        collapsible
        defaultCollapsed
      />

      {/* Ficha física + Costos estimados + Análisis derivado quedaron
          reemplazadas por la sección Análisis Financiero arriba
          (Sprint 4B refinamiento — Beto: "la ficha ya puede salir
          sobrando"). */}

      {anteproyecto.notas ? (
        <DetailDrawerSection title="Notas" collapsible defaultCollapsed>
          <p className="whitespace-pre-line text-sm text-[var(--text)]/80">{anteproyecto.notas}</p>
        </DetailDrawerSection>
      ) : null}

      <ProyectoChecklist
        proyectoId={anteproyecto.id}
        tipo="anteproyecto"
        fechaArranque={anteproyecto.fecha_inicio}
        empresaId={DILESA_EMPRESA_ID}
        empresaSlug="dilesa"
        puedeAutorizar={puedeAutorizar}
        onChecklistState={handleChecklistState}
        collapsible
        defaultCollapsed
      />

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
