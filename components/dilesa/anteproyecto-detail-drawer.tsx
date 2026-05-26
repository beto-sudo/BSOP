'use client';

/**
 * AnteproyectoDetailDrawer — detalle de un anteproyecto DILESA con su
 * análisis financiero derivado.
 *
 * Iniciativa `dilesa-proyectos-anteproyectos` Sprint 2. Anteproyectos
 * son rows en `dilesa.proyectos` con `tipo='anteproyecto'` — comparten
 * el shape de un `<ProyectoDetalle>` pero NO tienen unidades aún
 * (no se materializan hasta que el anteproyecto se promueve a desarrollo).
 *
 * Foco de la UI: análisis de viabilidad. Muestra la ficha del
 * anteproyecto + indicadores derivados client-side (suma de costos,
 * aprovechamiento, % áreas verdes, costo por lote, costo por m²
 * vendible) que ayudan a la decisión "arrancar o descartar". La
 * checklist de tareas y el presupuesto preliminar son entregables del
 * Sprint 3.
 */

import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Badge } from '@/components/ui/badge';
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

  // Diferencia entre presupuesto y suma de costos (control de consistencia).
  // Si el presupuesto cuadra con la suma de partidas, el delta es ~0.
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
  if (!anteproyecto) return null;

  const analisis = deriveAnalisis(anteproyecto);

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

  const fichaAnalisis: { label: string; value: string; tone?: 'success' | 'warning' }[] = (
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

        <DetailDrawerSection title="Próximamente">
          <p className="text-sm text-[var(--text)]/60">
            Sprint 3 agrega el checklist de tareas canónicas (35 trámites/estudios/cotizaciones) con
            dependencias y fechas objetivo, y la captura de presupuestos preliminares. Sprint 4
            agrega la acción &quot;promover a desarrollo&quot;.
          </p>
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
