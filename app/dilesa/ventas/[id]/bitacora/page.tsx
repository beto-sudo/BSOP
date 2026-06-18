'use client';

/**
 * Tab "Bitácora" del expediente de venta DILESA. Las fases cerradas en orden,
 * con quién las registró y cuándo. Consume el `VentaDetalleProvider` montado
 * por el layout `[id]/layout.tsx`.
 *
 * @module Venta · Bitácora (DILESA)
 * @responsive desktop-only
 */

import { RequireAccess } from '@/components/require-access';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import { Section } from '@/components/dilesa/venta-detalle/ui';
import { fmtFecha } from '@/components/dilesa/venta-detalle/types';

export default function VentaBitacoraPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.bitacora">
      <BitacoraBody />
    </RequireAccess>
  );
}

function BitacoraBody() {
  const { venta, pipelineRows, registradoresPorId } = useVentaDetalle();
  if (!venta) return null;

  return (
    <Section title="Bitácora de fases">
      {pipelineRows.filter((r) => r.alcanzada).length === 0 ? (
        <p className="text-sm text-[var(--text)]/50">Sin fases cerradas aún.</p>
      ) : (
        <ol className="space-y-1.5">
          {pipelineRows
            .filter((r) => r.alcanzada)
            .map((r) => {
              const quien = r.registradoPor ? registradoresPorId.get(r.registradoPor) : null;
              return (
                <li key={r.pos} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text)]/80">
                    <span className="mr-2 font-mono text-[11px] text-[var(--text)]/40">
                      {r.pos}
                    </span>
                    {r.nombre}
                  </span>
                  <span className="text-[11px] text-[var(--text)]/55">
                    {quien ? <span className="mr-2 text-[var(--text)]/45">{quien}</span> : null}
                    {r.fecha ? fmtFecha(r.fecha) : '—'}
                  </span>
                </li>
              );
            })}
        </ol>
      )}
    </Section>
  );
}
