'use client';

import { useMemo } from 'react';
import type { ReciboVista } from '@/lib/sanren-servicios';
import {
  computePronostico,
  computePronosticoGasto,
  computeBancoProyectado,
} from '@/lib/sanren/servicios-analytics';

/**
 * Gráficas de tendencia del módulo SANREN → Servicios (iniciativa
 * sanren-servicios). SVG a mano con tokens del theme (patrón Playtomic/Health,
 * sin librería de charts).
 *
 * Cada gráfica de consumo/gasto proyecta el **próximo periodo** (barra punteada
 * "esperado") mezclando tendencia reciente + estacionalidad. La gráfica solar
 * superpone la **línea del banco de energía** (kWh a favor acumulados) para ver
 * el saldo disponible contra lo que se consume.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesCorto(periodo: string): string {
  const [y, m] = periodo.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

function money(n: number): string {
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

const kwh = (n: number) => `${Math.round(n).toLocaleString('es-MX')} kWh`;

const SERVICIO_COLOR: Record<string, string> = {
  luz: 'var(--color-amber-500, #f59e0b)',
  gas: 'var(--color-orange-500, #f97316)',
  agua: 'var(--color-sky-500, #0ea5e9)',
};

const BANCO_COLOR = 'var(--color-violet-500, #8b5cf6)';

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {subtitle ? <p className="text-xs text-[var(--text)]/55">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function ServiciosTendencias({ recibos }: { recibos: ReciboVista[] }) {
  // ── Gasto mensual por servicio (últimos 24 meses con monto) ─────────────────
  const gasto = useMemo(() => {
    const byMes = new Map<string, Record<string, number>>();
    for (const r of recibos) {
      if (r.monto == null) continue;
      const mes = r.periodo.slice(0, 7);
      const row = byMes.get(mes) ?? {};
      row[r.servicio_tipo] = (row[r.servicio_tipo] ?? 0) + r.monto;
      byMes.set(mes, row);
    }
    const meses = Array.from(byMes.keys()).sort().slice(-24);
    const tipos = Array.from(new Set(recibos.map((r) => r.servicio_tipo))).sort();
    const data = meses.map((mes) => {
      const row = byMes.get(mes) ?? {};
      const total = tipos.reduce((a, t) => a + (row[t] ?? 0), 0);
      return { mes, row, total };
    });
    const forecast = computePronosticoGasto(recibos);
    const max = Math.max(1, ...data.map((d) => d.total), forecast?.valor ?? 0);
    return { data, tipos, max, forecast };
  }, [recibos]);

  // ── Solar: consumo vs producción + banco de energía por periodo ─────────────
  const solar = useMemo(() => {
    const luz = recibos
      .filter(
        (r) => r.tiene_produccion && (r.consumo_periodo != null || r.produccion_periodo != null)
      )
      .map((r) => ({
        periodo: r.periodo.slice(0, 7),
        consumo: r.consumo_periodo ?? 0,
        produccion: r.produccion_periodo ?? 0,
        banco: r.extraccion?.energia_acumulada_favor ?? null,
        forecast: false,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .slice(-18);

    const luzRecibos = recibos.filter((r) => r.tiene_produccion);
    const fcConsumo = computePronostico(luzRecibos, (r) => r.consumo_periodo);
    const fcProduccion = computePronostico(luzRecibos, (r) => r.produccion_periodo);
    const fcPeriodo = fcConsumo?.periodo ?? fcProduccion?.periodo ?? null;

    const items = [...luz];
    if (fcPeriodo) {
      items.push({
        periodo: fcPeriodo,
        consumo: fcConsumo?.valor ?? 0,
        produccion: fcProduccion?.valor ?? 0,
        banco: null,
        forecast: true,
      });
    }

    const bancoProy = computeBancoProyectado(recibos);
    const max = Math.max(1, ...items.map((d) => Math.max(d.consumo, d.produccion)));
    const bancoMax = Math.max(1, ...luz.map((d) => d.banco ?? 0), bancoProy?.banco ?? 0);
    return { items, max, bancoMax, hayBanco: luz.some((d) => d.banco != null), bancoProy };
  }, [recibos]);

  // ── Ahorro: gasto de luz por año ────────────────────────────────────────────
  const luzPorAnio = useMemo(() => {
    const byAnio = new Map<string, number>();
    for (const r of recibos) {
      if (r.servicio_tipo !== 'luz' || r.monto == null) continue;
      const anio = r.periodo.slice(0, 4);
      byAnio.set(anio, (byAnio.get(anio) ?? 0) + r.monto);
    }
    return Array.from(byAnio.entries()).sort();
  }, [recibos]);

  const W = 880;
  const H = 240;
  const PAD_B = 28;

  // Slots del gasto: meses reales + un slot "esperado" si hay pronóstico.
  const gastoSlots = gasto.forecast
    ? [...gasto.data, { mes: gasto.forecast.periodo, row: {}, total: gasto.forecast.valor }]
    : gasto.data;

  return (
    <div className="space-y-4">
      {/* Gasto mensual por servicio (barras apiladas) + pronóstico */}
      <Card title="Gasto mensual por servicio" subtitle="Últimos 24 meses con recibo capturado">
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--text)]/65">
          {gasto.tipos.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERVICIO_COLOR[t] ?? 'var(--text)' }}
              />
              {t}
            </span>
          ))}
          {gasto.forecast ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--text)]/60" />
              esperado ({mesCorto(gasto.forecast.periodo)})
              {gasto.forecast.cubiertoPorBanco ? ' · cubierto por banco' : ''}
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="min-w-[760px]">
            {[0.25, 0.5, 0.75, 1].map((tick) => (
              <line
                key={tick}
                x1="0"
                x2={W}
                y1={H - tick * H}
                y2={H - tick * H}
                stroke="var(--text)"
                strokeOpacity="0.08"
              />
            ))}
            {gastoSlots.map((d, i) => {
              const bw = Math.max(6, Math.min(34, W / Math.max(gastoSlots.length, 1) - 6));
              const x = i * (W / Math.max(gastoSlots.length, 1)) + 3;
              const isForecast = gasto.forecast != null && i === gastoSlots.length - 1;
              if (isForecast) {
                const h = (d.total / gasto.max) * H;
                return (
                  <g key={d.mes}>
                    <rect
                      x={x}
                      y={H - h}
                      width={bw}
                      height={h}
                      fill="var(--text)"
                      fillOpacity={0.12}
                      stroke="var(--text)"
                      strokeOpacity={0.55}
                      strokeDasharray="3 2"
                    >
                      <title>
                        {`${d.mes} (esperado): ${money(d.total)}` +
                          (gasto.forecast?.cubiertoPorBanco
                            ? ' — consumo neto cubierto por el banco de energía (solo cargo fijo)'
                            : '')}
                      </title>
                    </rect>
                    <text
                      x={x + bw / 2}
                      y={H + 18}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--text)"
                      opacity="0.5"
                    >
                      {mesCorto(d.mes)}
                    </text>
                  </g>
                );
              }
              let yAcc = H;
              return (
                <g key={d.mes}>
                  {gasto.tipos.map((t) => {
                    const v = d.row[t] ?? 0;
                    const h = (v / gasto.max) * H;
                    yAcc -= h;
                    return (
                      <rect
                        key={t}
                        x={x}
                        y={yAcc}
                        width={bw}
                        height={h}
                        fill={SERVICIO_COLOR[t] ?? 'var(--text)'}
                        opacity={0.9}
                      >
                        <title>{`${d.mes} · ${t}: ${money(v)}`}</title>
                      </rect>
                    );
                  })}
                  {i % 3 === 0 ? (
                    <text
                      x={x + bw / 2}
                      y={H + 18}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--text)"
                      opacity="0.5"
                    >
                      {mesCorto(d.mes)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      </Card>

      {/* Solar: consumo vs generación + banco de energía + pronóstico */}
      {solar.items.length > 0 ? (
        <Card
          title="Energía: consumo vs. generación + banco (Luz)"
          subtitle="kWh por periodo — la línea morada es el saldo del banco de energía; la barra punteada es el próximo periodo esperado"
        >
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--text)]/65">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--text)]/40" /> Consumo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Generación
            </span>
            {solar.hayBanco ? (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ backgroundColor: BANCO_COLOR }} /> Banco (kWh a
                favor)
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--text)]/60" />{' '}
              esperado
            </span>
          </div>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="min-w-[760px]">
              {[0.25, 0.5, 0.75, 1].map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2={W}
                  y1={H - tick * H}
                  y2={H - tick * H}
                  stroke="var(--text)"
                  strokeOpacity="0.08"
                />
              ))}
              {solar.items.map((d, i) => {
                const slot = W / Math.max(solar.items.length, 1);
                const bw = Math.max(4, Math.min(18, slot / 2 - 3));
                const x = i * slot + 3;
                const hC = (d.consumo / solar.max) * H;
                const hP = (d.produccion / solar.max) * H;
                const dash = d.forecast ? { strokeDasharray: '3 2', strokeWidth: 1 } : {};
                return (
                  <g key={d.periodo}>
                    <rect
                      x={x}
                      y={H - hC}
                      width={bw}
                      height={hC}
                      fill="var(--text)"
                      opacity={d.forecast ? 0.18 : 0.4}
                      stroke={d.forecast ? 'var(--text)' : undefined}
                      strokeOpacity={0.55}
                      {...dash}
                    >
                      <title>{`${d.periodo}${d.forecast ? ' (esperado)' : ''} · consumo: ${kwh(d.consumo)}`}</title>
                    </rect>
                    <rect
                      x={x + bw + 2}
                      y={H - hP}
                      width={bw}
                      height={hP}
                      fill="#10b981"
                      opacity={d.forecast ? 0.3 : 1}
                      stroke={d.forecast ? '#10b981' : undefined}
                      {...dash}
                    >
                      <title>{`${d.periodo}${d.forecast ? ' (esperado)' : ''} · generación: ${kwh(d.produccion)}`}</title>
                    </rect>
                    {i % 2 === 0 ? (
                      <text
                        x={x + bw}
                        y={H + 18}
                        textAnchor="middle"
                        fontSize="10"
                        fill="var(--text)"
                        opacity="0.5"
                      >
                        {mesCorto(d.periodo)}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* Línea del banco de energía (eje propio, escala bancoMax) */}
              {solar.hayBanco ? (
                <>
                  <polyline
                    fill="none"
                    stroke={BANCO_COLOR}
                    strokeWidth={2}
                    points={solar.items
                      .map((d, i) => {
                        if (d.banco == null) return null;
                        const slot = W / Math.max(solar.items.length, 1);
                        const x = i * slot + 3 + (Math.max(4, Math.min(18, slot / 2 - 3)) + 2);
                        const y = H - (d.banco / solar.bancoMax) * H;
                        return `${x},${y}`;
                      })
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {solar.items.map((d, i) => {
                    if (d.banco == null) return null;
                    const slot = W / Math.max(solar.items.length, 1);
                    const x = i * slot + 3 + (Math.max(4, Math.min(18, slot / 2 - 3)) + 2);
                    const y = H - (d.banco / solar.bancoMax) * H;
                    return (
                      <circle key={`b-${d.periodo}`} cx={x} cy={y} r={2.5} fill={BANCO_COLOR}>
                        <title>{`${d.periodo} · banco: ${kwh(d.banco)} a favor`}</title>
                      </circle>
                    );
                  })}
                  {/* Proyección del banco al próximo periodo (segmento punteado):
                      el consumo neto esperado se descuenta del saldo. */}
                  {solar.bancoProy
                    ? (() => {
                        const slot = W / Math.max(solar.items.length, 1);
                        const off = Math.max(4, Math.min(18, slot / 2 - 3)) + 2;
                        const reales = solar.items
                          .map((d, i) => (d.banco != null ? i : -1))
                          .filter((i) => i >= 0);
                        const lastIdx = reales[reales.length - 1];
                        if (lastIdx == null) return null;
                        const x1 = lastIdx * slot + 3 + off;
                        const y1 = H - ((solar.items[lastIdx].banco ?? 0) / solar.bancoMax) * H;
                        const x2 = (solar.items.length - 1) * slot + 3 + off;
                        const y2 = H - (solar.bancoProy.banco / solar.bancoMax) * H;
                        return (
                          <>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={BANCO_COLOR}
                              strokeWidth={2}
                              strokeDasharray="4 3"
                              opacity={0.7}
                            />
                            <circle
                              cx={x2}
                              cy={y2}
                              r={3}
                              fill="var(--card)"
                              stroke={BANCO_COLOR}
                              strokeWidth={1.5}
                            >
                              <title>
                                {`${solar.bancoProy.periodo} · banco esperado: ${kwh(solar.bancoProy.banco)} a favor` +
                                  (solar.bancoProy.netoDelBanco > 0
                                    ? ` (−${kwh(solar.bancoProy.netoDelBanco)} del banco)`
                                    : ` (+${kwh(-solar.bancoProy.netoDelBanco)} al banco)`)}
                              </title>
                            </circle>
                          </>
                        );
                      })()
                    : null}
                </>
              ) : null}
            </svg>
          </div>
        </Card>
      ) : null}

      {/* Ahorro solar: gasto de luz por año */}
      {luzPorAnio.length > 1 ? (
        <Card
          title="Gasto de Luz por año"
          subtitle="El efecto de los paneles solares en el recibo de CFE"
        >
          <div className="flex flex-wrap items-end gap-6">
            {luzPorAnio.map(([anio, total]) => {
              const max = Math.max(...luzPorAnio.map(([, t]) => t));
              return (
                <div key={anio} className="flex flex-col items-center gap-2">
                  <div className="flex h-28 items-end">
                    <div
                      className="w-14 rounded-t bg-amber-500/80"
                      style={{ height: `${Math.max(4, (total / max) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-semibold text-[var(--text)]">{money(total)}</div>
                    <div className="text-xs text-[var(--text)]/55">{anio}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
