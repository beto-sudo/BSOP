'use client';

/**
 * Tab «Fluidez» del expediente de venta DILESA — iniciativa
 * dilesa-fluidez-pipeline. Cómo va ESTA venta contra el objetivo, fase por fase:
 * días en cada fase recorrida vs. la vara (meta de Dirección o mediana
 * histórica), con banda. La fase en curso cuenta su permanencia abierta.
 *
 * Consume el `VentaDetalleProvider` del layout (historial de fases ya cargado) y
 * solo pega a `v_fase_vara` (14 filas) para las varas. Reusa el slug RBAC del
 * Pipeline (`dilesa.ventas.pipeline`): es la misma lectura del pipeline.
 *
 * @module Venta · Fluidez (DILESA)
 * @responsive desktop-only
 */

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/dilesa/venta-detalle/ui';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { colorFluidez, labelFluidez, toneFluidez } from '@/lib/dilesa/fluidez-venta';
import {
  fluidezDeVenta,
  type ResumenFluidezVenta,
  type VaraRef,
} from '@/lib/dilesa/fluidez-venta-detalle';

export function FluidezTabBody() {
  const { venta, fases } = useVentaDetalle();
  const [varas, setVaras] = useState<Map<number, VaraRef>>(new Map());

  useEffect(() => {
    let activo = true;
    const sb = createSupabaseBrowserClient();
    void sb
      .schema('dilesa')
      .rpc('fn_fase_vara', { p_empresa: DILESA_EMPRESA_ID })
      .then(({ data }) => {
        if (!activo) return;
        const m = new Map<number, VaraRef>();
        for (const b of data ?? []) {
          if (b.posicion != null) m.set(b.posicion, { vara: b.vara, p90: b.p90 });
        }
        setVaras(m);
      });
    return () => {
      activo = false;
    };
  }, []);

  if (!venta) return null;

  const resumen: ResumenFluidezVenta = fluidezDeVenta(
    fases
      .filter((f): f is typeof f & { posicion: number } => f.posicion != null)
      .map((f) => ({ posicion: f.posicion, fase: f.fase, fecha: f.fecha })),
    varas,
    { faseActualPos: venta.fase_posicion }
  );

  return (
    <Section
      title="Fluidez"
      description="Días en cada fase vs. el objetivo (meta de Dirección o mediana histórica). La fase en curso cuenta su tiempo corriendo."
    >
      {/* Resumen */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Tarjeta label="Fase actual">
          {resumen.actual ? (
            <span className="flex items-center gap-2">
              <span className="font-medium text-[var(--text)]">{resumen.actual.fase}</span>
              {resumen.actual.banda ? (
                <Badge tone={toneFluidez(resumen.actual.banda)}>
                  {labelFluidez(resumen.actual.banda)}
                </Badge>
              ) : null}
            </span>
          ) : (
            <span className="text-[var(--text)]/40">—</span>
          )}
        </Tarjeta>
        <Tarjeta label="En objetivo">
          <span className="tabular-nums">
            {resumen.enObjetivo}/{resumen.medibles}
          </span>
        </Tarjeta>
        <Tarjeta label="Fases críticas">
          <span className={`tabular-nums ${resumen.criticas > 0 ? 'text-red-500' : ''}`}>
            {resumen.criticas}
          </span>
        </Tarjeta>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]/40 text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
              <th className="w-10 px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Fase</th>
              <th className="px-3 py-2.5 text-right font-medium">Días</th>
              <th className="px-3 py-2.5 text-right font-medium">Objetivo</th>
              <th className="px-3 py-2.5 text-center font-medium">Banda</th>
            </tr>
          </thead>
          <tbody>
            {resumen.filas.map((f) => (
              <tr
                key={f.posicion}
                className={`border-b border-[var(--border)]/50 last:border-0 ${
                  f.enCurso ? 'bg-[var(--accent)]/5' : !f.alcanzada ? 'opacity-50' : ''
                }`}
              >
                <td className="px-3 py-2.5 font-mono text-xs text-[var(--text)]/40">
                  {String(f.posicion).padStart(2, '0')}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-medium text-[var(--text)]">
                    {f.fase || `Fase ${f.posicion}`}
                  </span>
                  {f.enCurso ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--accent)]">
                      en curso
                    </span>
                  ) : null}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                    f.banda ? colorFluidez(f.banda) : 'text-[var(--text)]/70'
                  }`}
                >
                  {f.dias != null ? `${f.dias} d` : '—'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]/45">
                  {f.vara != null ? `${f.vara} d` : '—'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {f.banda ? (
                    <Badge tone={toneFluidez(f.banda)}>{labelFluidez(f.banda)}</Badge>
                  ) : (
                    <span className="text-[var(--text)]/25">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Tarjeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text)]/45">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
