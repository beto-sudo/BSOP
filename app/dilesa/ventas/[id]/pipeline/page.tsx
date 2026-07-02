'use client';

/**
 * Tab "Pipeline" del expediente de venta DILESA. Las 17 fases agrupadas en
 * macro-etapas, con sus documentos (cargados/faltantes) y el acceso a la
 * captura de cada fase. Consume el `VentaDetalleProvider` montado por el layout
 * `[id]/layout.tsx`. Extraído de Operación en el Sprint 2 de
 * `dilesa-ventas-expediente-tabs`.
 *
 * @module Venta · Pipeline (DILESA)
 * @responsive desktop-only
 */

import Link from 'next/link';
import { Check, Circle, FileText, Pencil } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { ROL_LABEL } from '@/lib/dilesa/captura/fase-roles';
import { camposCapturadosPorFase } from '@/lib/dilesa/captura/campos-capturados';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';
import { Section, AdjuntoLink } from '@/components/dilesa/venta-detalle/ui';
import { MACRO_ETAPAS, fmtMoney, fmtFecha } from '@/components/dilesa/venta-detalle/types';

export default function VentaPipelinePage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.pipeline">
      <PipelineBody />
    </RequireAccess>
  );
}

function PipelineBody() {
  const { ventaId: id, venta, pipelineRows, pipelineAlcanzadas } = useVentaDetalle();
  if (!venta) return null;

  return (
    <Section title="Pipeline" description={`${pipelineAlcanzadas} de 17 fases alcanzadas`}>
      <div className="space-y-4">
        {MACRO_ETAPAS.map((etapa) => {
          const filas = pipelineRows.filter((r) => r.pos >= etapa.desde && r.pos <= etapa.hasta);
          const cerradas = filas.filter((r) => r.alcanzada).length;
          return (
            <div key={etapa.nombre}>
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
                  {etapa.nombre}
                </h3>
                <span
                  className={`text-[10px] ${cerradas === filas.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]/40'}`}
                >
                  {cerradas}/{filas.length}
                </span>
              </div>
              <ol className="space-y-1 border-l-2 border-[var(--border)] pl-2">
                {filas.map((r) => {
                  const capturados =
                    r.alcanzada && venta ? camposCapturadosPorFase(r.pos, venta, fmtMoney) : [];
                  return (
                    <li
                      key={r.pos}
                      className={
                        'rounded-md px-2 py-1.5 ' +
                        (r.alcanzada ? 'bg-[var(--bg)]/40' : 'opacity-60')
                      }
                    >
                      <div className="flex items-start gap-3">
                        {/* Status circle + posición */}
                        <div className="flex w-8 shrink-0 items-center gap-1.5 pt-0.5">
                          {r.alcanzada ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-[var(--text)]/30" />
                          )}
                          <span className="font-mono text-[10px] tabular-nums text-[var(--text)]/40">
                            {r.pos}
                          </span>
                        </div>

                        {/* Nombre + fecha */}
                        <div className="min-w-[200px] shrink-0">
                          <div className="text-sm font-medium text-[var(--text)]">{r.nombre}</div>
                          <div className="text-[11px] text-[var(--text)]/50">
                            {r.fecha ? fmtFecha(r.fecha) : '—'}
                          </div>
                        </div>

                        {/* Docs cargados + faltantes */}
                        <div className="flex flex-1 flex-wrap items-center gap-1">
                          {r.cargados.map((a) => (
                            <AdjuntoLink key={a.id} a={a} compact />
                          ))}
                          {r.faltantes.map((rol) => (
                            <span
                              key={rol}
                              className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text)]/40"
                              title={`Falta cargar: ${ROL_LABEL[rol] ?? rol}`}
                            >
                              <FileText className="h-2.5 w-2.5" />
                              {ROL_LABEL[rol] ?? rol}
                            </span>
                          ))}
                          {r.cargados.length === 0 && r.faltantes.length === 0 ? (
                            <span className="text-[10px] text-[var(--text)]/30">—</span>
                          ) : null}
                        </div>

                        {/* Capturar fase — solo si la página está implementada y aplica */}
                        {r.slugCaptura ? (
                          <div className="shrink-0">
                            {r.puedeCapturar ? (
                              <Link
                                href={`/dilesa/ventas/${id}/capturar/${r.slugCaptura}`}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                                Capturar fase
                              </Link>
                            ) : r.alcanzada ? (
                              <Link
                                href={`/dilesa/ventas/${id}/capturar/${r.slugCaptura}`}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)]/60 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
                                title="Ver la fase cerrada; algunas permiten corregir datos o reemplazar documentos."
                              >
                                <Pencil className="h-2.5 w-2.5" />
                                Ver / corregir
                              </Link>
                            ) : (
                              <span
                                className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text)]/30"
                                title={`Falta cerrar la fase ${r.pos - 1} primero.`}
                              >
                                <Pencil className="h-2.5 w-2.5" />
                                Capturar
                              </span>
                            )}
                          </div>
                        ) : null}
                      </div>

                      {/* Fase 12 se cierra sola por CxC — sin captura manual
                          (decisión Beto 2026-07-01); la fecha es la base de
                          comisiones, por eso la nota vive también aquí. */}
                      {r.pos === 12 ? (
                        <p className="ml-11 mt-0.5 text-[10px] text-[var(--text)]/45">
                          Se cierra sola al registrar el abono de la institución en el estado de
                          cuenta (con comprobante y XML del recibo). La fecha de la fase = fecha del
                          último abono de institución en Cobranza — base del cálculo de comisiones;
                          para corregirla, corrige el abono en CxC.
                        </p>
                      ) : null}

                      {/* Qué se capturó en esta fase (expandible) */}
                      {capturados.length > 0 ? (
                        <details className="ml-11 mt-0.5">
                          <summary className="cursor-pointer select-none text-[10px] text-[var(--text)]/45 hover:text-[var(--text)]/70">
                            Datos capturados ({capturados.length})
                          </summary>
                          <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
                            {capturados.map(([label, value]) => (
                              <div key={label} className="flex items-baseline gap-2 text-[11px]">
                                <dt className="shrink-0 text-[var(--text)]/45">{label}:</dt>
                                <dd className="font-medium tabular-nums text-[var(--text)]/85">
                                  {value.match(/^\d{4}-\d{2}-\d{2}$/) ? fmtFecha(value) : value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
