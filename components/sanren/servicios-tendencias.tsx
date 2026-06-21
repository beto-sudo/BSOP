'use client';

import { useMemo } from 'react';
import type { ReciboVista } from '@/lib/sanren-servicios';

/**
 * Gráficas de tendencia del módulo SANREN → Servicios (iniciativa
 * sanren-servicios, Sprint 4). SVG a mano con tokens del theme (patrón
 * Playtomic/Health, sin librería de charts).
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

const SERVICIO_COLOR: Record<string, string> = {
  luz: 'var(--color-amber-500, #f59e0b)',
  gas: 'var(--color-orange-500, #f97316)',
  agua: 'var(--color-sky-500, #0ea5e9)',
};

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
    const max = Math.max(1, ...data.map((d) => d.total));
    return { data, tipos, max };
  }, [recibos]);

  // ── Solar: consumo vs producción de luz por periodo ─────────────────────────
  const solar = useMemo(() => {
    const luz = recibos
      .filter(
        (r) => r.tiene_produccion && (r.consumo_periodo != null || r.produccion_periodo != null)
      )
      .map((r) => ({
        periodo: r.periodo.slice(0, 7),
        consumo: r.consumo_periodo ?? 0,
        produccion: r.produccion_periodo ?? 0,
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))
      .slice(-18);
    const max = Math.max(1, ...luz.map((d) => Math.max(d.consumo, d.produccion)));
    return { luz, max };
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

  return (
    <div className="space-y-4">
      {/* Gasto mensual por servicio (barras apiladas) */}
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
            {gasto.data.map((d, i) => {
              const bw = Math.max(6, Math.min(34, W / Math.max(gasto.data.length, 1) - 6));
              const x = i * (W / Math.max(gasto.data.length, 1)) + 3;
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

      {/* Solar: consumo vs producción */}
      {solar.luz.length > 0 ? (
        <Card
          title="Energía: consumo vs. generación solar (Luz)"
          subtitle="kWh por periodo — cuando la barra verde supera la gris, generaste más de lo que consumiste"
        >
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--text)]/65">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--text)]/40" /> Consumo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Generación
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
              {solar.luz.map((d, i) => {
                const slot = W / Math.max(solar.luz.length, 1);
                const bw = Math.max(4, Math.min(18, slot / 2 - 3));
                const x = i * slot + 3;
                const hC = (d.consumo / solar.max) * H;
                const hP = (d.produccion / solar.max) * H;
                return (
                  <g key={d.periodo}>
                    <rect x={x} y={H - hC} width={bw} height={hC} fill="var(--text)" opacity={0.4}>
                      <title>{`${d.periodo} · consumo: ${d.consumo} kWh`}</title>
                    </rect>
                    <rect x={x + bw + 2} y={H - hP} width={bw} height={hP} fill="#10b981">
                      <title>{`${d.periodo} · generación: ${d.produccion} kWh`}</title>
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
