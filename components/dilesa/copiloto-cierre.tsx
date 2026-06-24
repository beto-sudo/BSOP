'use client';

/**
 * Copiloto de cierre (S4 dilesa-ventas-expediente) — tarjeta del Expediente
 * de Operación que dice en lenguaje claro qué falta para terminar la
 * operación, y habilita el cierre (F17) cuando todo está en orden.
 *
 * Presentational: el padre computa el `CopilotoResultado` con
 * `evaluarCierre` (lib/dilesa/copiloto-cierre).
 */

import Link from 'next/link';
import { CheckCircle2, ChevronRight, Circle, Flag, PartyPopper } from 'lucide-react';
import type { CopilotoResultado, CopilotoDestino } from '@/lib/dilesa/copiloto-cierre';

/** Traduce el destino semántico de un pendiente al tab/captura concreto. */
function hrefDestino(ventaId: string, destino: CopilotoDestino): string {
  switch (destino) {
    case 'pipeline':
      return `/dilesa/ventas/${ventaId}/pipeline`;
    case 'cuadratura':
      return `/dilesa/ventas/${ventaId}/cuadratura`;
    case 'conformidad':
      return `/dilesa/ventas/${ventaId}/capturar/16-conformidad`;
  }
}

export function CopilotoCierre({
  resultado,
  ventaId,
  fase17Cerrada,
  fecha17,
}: {
  resultado: CopilotoResultado;
  ventaId: string;
  /** Si la operación ya está terminada, el copiloto se vuelve el sello. */
  fase17Cerrada: boolean;
  fecha17: string | null;
}) {
  if (fase17Cerrada) {
    return (
      <section className="rounded-lg border border-emerald-400/40 bg-emerald-50 p-4 dark:bg-emerald-950/25">
        <div className="flex items-center gap-2">
          <PartyPopper className="size-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Operación cerrada{fecha17 ? ` · ${fecha17}` : ''}
          </h3>
        </div>
        <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
          Expediente completo, cuadratura cubierta y conformidad del cliente registrada.
        </p>
      </section>
    );
  }

  const completados = resultado.items.length - resultado.pendientes;

  return (
    <section
      className={`rounded-lg border p-4 ${
        resultado.listo
          ? 'border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-950/20'
          : 'border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/60">
          <Flag className="size-3.5" /> Copiloto de cierre
        </h3>
        <span className="text-[11px] font-medium tabular-nums text-[var(--text)]/55">
          {completados}/{resultado.items.length}
        </span>
      </div>

      <ul className="space-y-1.5">
        {resultado.items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-[var(--text)]/30" />
            )}
            <div className="min-w-0">
              {!item.ok && item.destino ? (
                <Link
                  href={hrefDestino(ventaId, item.destino)}
                  className="group inline-flex items-center gap-1 font-medium text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {item.label}
                  <ChevronRight className="size-3.5 text-[var(--text)]/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                </Link>
              ) : (
                <span
                  className={item.ok ? 'text-[var(--text)]/70' : 'font-medium text-[var(--text)]'}
                >
                  {item.label}
                </span>
              )}
              {item.detalle ? (
                <p className="text-xs text-[var(--text)]/55">{item.detalle}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {resultado.listo ? (
        <Link
          href={`/dilesa/ventas/${ventaId}/capturar/17-operacion-terminada`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Cerrar operación
          <ChevronRight className="size-4" />
        </Link>
      ) : null}
    </section>
  );
}
