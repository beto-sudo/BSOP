'use client';

/**
 * Panel financiero del anteproyecto.
 *
 * Renderiza 9 KPI cards en grid 3x3 a partir de una fila de
 * `dilesa.v_anteproyectos_analisis`. Las métricas que dependen de
 * prototipos de referencia (valor_comercial_proyecto, costo_total_proyecto,
 * utilidad_proyecto, margen_pct) se muestran con placeholder "—" y un
 * hint cuando `prototipos_referenciados === 0`.
 *
 * El fetch lo hace el detail page y pasa los datos ya resueltos — este
 * componente es puro presentation. Así separamos testing (snapshot visual)
 * del lifecycle de datos y permite reuso eventual en Proyectos.
 */

import { AlertTriangle } from 'lucide-react';
import { formatCurrency, formatM2, formatPercent } from '@/lib/dilesa-constants';
import { Skeleton } from '@/components/ui/skeleton';

export type PanelFinancieroData = {
  aprovechamiento_pct: number | null;
  porcentaje_areas_verdes: number | null;
  lote_promedio_m2: number | null;
  precio_m2_aprovechable: number | null;
  prototipos_referenciados: number | null;
  valor_comercial_proyecto: number | null;
  costo_total_proyecto: number | null;
  utilidad_proyecto: number | null;
  margen_pct: number | null;
};

export function AnteproyectoPanelFinanciero({
  data,
  loading,
}: {
  data: PanelFinancieroData | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Panel financiero
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Panel financiero
        </h2>
        <p className="mt-4 text-sm text-[var(--text)]/55">
          No se pudo cargar el análisis financiero de este anteproyecto.
        </p>
      </section>
    );
  }

  const sinPrototipos = (data.prototipos_referenciados ?? 0) === 0;
  const utilidad = data.utilidad_proyecto;
  const margen = data.margen_pct;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text)]/50">
          Panel financiero
        </h2>
        <span className="text-[10px] text-[var(--text)]/40">
          Calculado en vivo desde v_anteproyectos_analisis
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Aprovechamiento" value={formatPercent(data.aprovechamiento_pct)} />
        <Kpi label="Áreas verdes" value={formatPercent(data.porcentaje_areas_verdes)} />
        <Kpi label="Lote promedio" value={formatM2(data.lote_promedio_m2)} />

        <Kpi label="Precio / m² aprovechable" value={formatCurrency(data.precio_m2_aprovechable)} />
        <Kpi
          label="Prototipos referenciados"
          value={(data.prototipos_referenciados ?? 0).toLocaleString('es-MX')}
        />
        <Kpi
          label="Valor comercial"
          value={
            sinPrototipos ? '—' : formatCurrency(data.valor_comercial_proyecto, { compact: true })
          }
          muted={sinPrototipos}
        />

        <Kpi
          label="Costo total proyecto"
          value={sinPrototipos ? '—' : formatCurrency(data.costo_total_proyecto, { compact: true })}
          muted={sinPrototipos}
        />
        <Kpi
          label="Utilidad proyecto"
          value={sinPrototipos ? '—' : formatCurrency(utilidad, { compact: true })}
          tone={!sinPrototipos && utilidad != null && utilidad < 0 ? 'negative' : 'default'}
          muted={sinPrototipos}
        />
        <Kpi
          label="Margen"
          value={sinPrototipos ? '—' : formatPercent(margen)}
          tone={!sinPrototipos && margen != null && margen < 0 ? 'negative' : 'default'}
          muted={sinPrototipos}
        />
      </div>

      {sinPrototipos ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Agrega prototipos de referencia para ver valor comercial, costo total, utilidad y margen
            proyectados.
          </span>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone = 'default',
  muted = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'negative';
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 ${
        muted ? 'opacity-60' : ''
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/45">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${
          tone === 'negative' ? 'text-red-400' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
