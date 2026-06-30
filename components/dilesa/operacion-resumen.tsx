'use client';

/**
 * Zona A del Expediente de Operación — cabecera persistente.
 *
 * Resumen siempre-a-la-vista de una venta: cliente, vivienda, datos
 * comerciales, estado del pipeline y la **mini-cuadratura** (Valor de
 * Escrituración vs Monto Disponible → Saldo, con semáforo).
 *
 * Presentacional: el padre calcula la `Cuadratura` (con
 * `lib/dilesa/cuadratura.ts`) y arma los strings. Iniciativa
 * `dilesa-ventas-expediente` (Sprint 1).
 */

import type { Cuadratura } from '@/lib/dilesa/cuadratura';
import { proximaFase } from '@/lib/dilesa/fases';
import { colorDiasFase } from '@/lib/dilesa/dias-en-fase';
import { colorFluidez, type BandaFluidez } from '@/lib/dilesa/fluidez-venta';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export type OperacionResumenProps = {
  cliente: { nombre: string; contacto: string | null; curp: string | null; ine: string | null };
  vivienda: {
    proyecto: string | null;
    mzLote: string | null;
    prototipo: string | null;
    domicilio: string | null;
    identificador: string | null;
  };
  precioAsignacion: number | null;
  valorEscrituracion: number | null;
  vendedor: string | null;
  faseActual: string | null;
  fasePosicion: number | null;
  totalFases: number;
  /** Días en la fase actual (S1 dilesa-fluidez-pipeline); `null` = sin dato. */
  diasEnFase?: number | null;
  /** Banda de riesgo de los días vs. el benchmark de la fase (S2b). */
  diasBanda?: BandaFluidez | null;
  cuadratura: Cuadratura;
};

export function OperacionResumen({
  cliente,
  vivienda,
  precioAsignacion,
  valorEscrituracion,
  vendedor,
  faseActual,
  fasePosicion,
  totalFases,
  diasEnFase,
  diasBanda,
  cuadratura,
}: OperacionResumenProps) {
  const pct =
    fasePosicion != null && totalFases > 0
      ? Math.round((Math.min(fasePosicion, totalFases) / totalFases) * 100)
      : 0;
  // "Lo que sigue" = la acción (infinitivo) de la fase posición+1.
  const sig = proximaFase(fasePosicion);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Bloque titulo="Cliente">
          <p className="text-sm font-semibold text-[var(--text)]">{cliente.nombre}</p>
          {cliente.contacto ? <Linea>{cliente.contacto}</Linea> : null}
          {cliente.curp ? <Linea>CURP: {cliente.curp}</Linea> : null}
          {cliente.ine ? <Linea>INE: {cliente.ine}</Linea> : null}
        </Bloque>

        <Bloque titulo="Vivienda">
          <p className="text-sm font-semibold text-[var(--text)]">
            {vivienda.identificador ?? '—'}
          </p>
          {vivienda.proyecto ? <Linea>{vivienda.proyecto}</Linea> : null}
          {vivienda.mzLote || vivienda.prototipo ? (
            <Linea>{[vivienda.mzLote, vivienda.prototipo].filter(Boolean).join(' · ')}</Linea>
          ) : null}
          {vivienda.domicilio ? <Linea>{vivienda.domicilio}</Linea> : null}
        </Bloque>

        <Bloque titulo="Comercial">
          <p className="text-sm font-semibold text-[var(--text)]">
            {money(precioAsignacion)}{' '}
            <span className="text-[11px] font-normal text-[var(--text)]/50">precio asignación</span>
          </p>
          {vendedor ? <Linea>Asesor: {vendedor}</Linea> : null}
          {faseActual ? (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[11px] text-[var(--text)]/60">
                <span className="font-medium text-[var(--text)]/80">{faseActual}</span>
                <span className="flex items-center gap-2">
                  {diasEnFase != null ? (
                    <span
                      className={`font-medium tabular-nums ${
                        diasBanda ? colorFluidez(diasBanda) : colorDiasFase(diasEnFase)
                      }`}
                    >
                      {diasEnFase} d en fase
                    </span>
                  ) : null}
                  <span>
                    {fasePosicion ?? 0}/{totalFases}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {sig ? (
                <p className="mt-1 text-[11px] text-[var(--text)]/55">
                  Sigue: <span className="font-medium text-[var(--text)]/75">{sig.accion}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </Bloque>
      </div>

      {/* Mini-cuadratura */}
      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <div className="flex flex-wrap items-stretch gap-x-6 gap-y-2 text-sm">
          <Cifra label="Valor escrituración" value={money(valorEscrituracion)} />
          <Cifra label="Crédito institución" value={money(cuadratura.creditoInstitucion)} />
          <Cifra label="Crédito directo (pagaré)" value={money(cuadratura.montoCreditoDirecto)} />
          <Cifra label="Depósitos directos" value={money(cuadratura.depositosDirectoCliente)} />
          {cuadratura.tieneDesglose ? (
            // Modelo desglosado (ADR-045): dos coberturas separadas — el precio lo
            // cubre el crédito (+ enganche); los gastos notariales los cubre el
            // presupuesto (subsidio + DILESA + enganche + sobreprecio + pagaré).
            // Ambos leen de la misma `cuadratura`; el pagaré real va en su columna
            // de arriba. "Precio" = `saldoPrecioPorCubrir` (saldo del precio −
            // enganche pagado), el MISMO "Saldo por cubrir" del panel — no el
            // `saldoPrecioEscrituracion` crudo (ignoraba el enganche → en Infonavit
            // mostraba 158,551 cuando el panel ya mostraba 1) ni el `saldoCliente`
            // crudo (mezclaba precio + descuento → −74,651).
            <div className="ml-auto flex items-stretch gap-x-6">
              <Cifra
                label="Precio"
                value={
                  (cuadratura.saldoPrecioPorCubrir ?? 0) > 0.5
                    ? money(cuadratura.saldoPrecioPorCubrir)
                    : 'Cubierto ✓'
                }
                strong
                tone={(cuadratura.saldoPrecioPorCubrir ?? 0) > 0.5 ? 'warn' : 'ok'}
              />
              <Cifra
                label="Gastos notariales"
                value={
                  Math.abs(cuadratura.coberturaGastos?.saldoCobertura ?? 0) <= 2
                    ? 'Cubierto ✓'
                    : money(cuadratura.coberturaGastos?.saldoCobertura)
                }
                strong
                tone={
                  Math.abs(cuadratura.coberturaGastos?.saldoCobertura ?? 0) <= 2 ? 'ok' : 'warn'
                }
              />
            </div>
          ) : (
            <>
              <Cifra label="Disponible" value={money(cuadratura.montoDisponible)} strong />
              <Cifra
                label="Cheque notaría (calc.)"
                value={money(cuadratura.chequeNotariaCalculado)}
              />
              <div className="ml-auto">
                <Cifra
                  label={cuadratura.cubierta ? 'Saldo' : 'Saldo pendiente'}
                  value={money(cuadratura.saldoCliente)}
                  strong
                  tone={cuadratura.cubierta ? 'ok' : 'warn'}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text)]/45">
        {titulo}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Linea({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text)]/65">{children}</p>;
}

function Cifra({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'ok' | 'warn';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--text)]';
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-[var(--text)]/45">{label}</span>
      <span className={`${strong ? 'text-base font-semibold' : 'font-medium'} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}
