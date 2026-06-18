'use client';

/**
 * Tab "Documentos" del expediente de venta DILESA. Los adjuntos cargados,
 * agrupados por macro-etapa del pipeline. Consume el `VentaDetalleProvider`
 * montado por el layout `[id]/layout.tsx`.
 *
 * @module Venta · Documentos (DILESA)
 * @responsive desktop-only
 */

import { RequireAccess } from '@/components/require-access';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import { Section, AdjuntoLink } from '@/components/dilesa/venta-detalle/ui';
import { MACRO_ETAPAS } from '@/components/dilesa/venta-detalle/types';

export default function VentaDocumentosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.documentos">
      <DocumentosBody />
    </RequireAccess>
  );
}

function DocumentosBody() {
  const { venta, pipelineRows } = useVentaDetalle();
  if (!venta) return null;

  return (
    <Section title="Documentos del expediente">
      {pipelineRows.flatMap((r) => r.cargados).length === 0 ? (
        <p className="text-sm text-[var(--text)]/50">Sin documentos cargados aún.</p>
      ) : (
        <div className="space-y-4">
          {MACRO_ETAPAS.map((me) => {
            const rowsConDocs = pipelineRows.filter(
              (r) => r.pos >= me.desde && r.pos <= me.hasta && r.cargados.length > 0
            );
            if (rowsConDocs.length === 0) return null;
            const total = rowsConDocs.reduce((s, r) => s + r.cargados.length, 0);
            return (
              <div key={me.nombre}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
                  {me.nombre} <span className="font-normal text-[var(--text)]/40">· {total}</span>
                </h4>
                <div className="space-y-2">
                  {rowsConDocs.map((r) => (
                    <div key={r.pos} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-44 shrink-0 text-[11px] text-[var(--text)]/50">
                        {r.pos}. {r.nombre}
                      </span>
                      {r.cargados.map((a) => (
                        <AdjuntoLink key={a.id} a={a} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
