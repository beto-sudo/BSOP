'use client';

/**
 * Pestaña Cuadratura del Expediente de Operación (Zona C).
 *
 * Muestra el modelo financiero completo calculado por
 * `lib/dilesa/cuadratura.ts`: cobertura (disponible vs valor de
 * escrituración → saldo), los derivados de cierre (cheque notaría, valor
 * real, facturado, nota de crédito, descuento real) y las comisiones.
 *
 * Iniciativa `dilesa-ventas-expediente` (Sprint 1; se completa en Sprint 2
 * al capturar los gaps: apoyo Infonavit, buckets de descuento, recibo de
 * caja por depósito).
 */

import type { Cuadratura } from '@/lib/dilesa/cuadratura';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export type CuadraturaPanelProps = {
  cuadratura: Cuadratura;
  valorEscrituracion: number | null;
  /** Si el cheque a notaría ya se capturó (Fase 11) vs el calculado. */
  chequeCapturado: boolean;
};

export function CuadraturaPanel({
  cuadratura: c,
  valorEscrituracion,
  chequeCapturado,
}: CuadraturaPanelProps) {
  return (
    <div className="space-y-5">
      {/* Cobertura */}
      <Bloque titulo="Cobertura de la operación">
        <Fila label="Valor de escrituración" value={money(valorEscrituracion)} />
        <div className="my-1 border-t border-dashed border-[var(--border)]" />
        <Fila
          label="Crédito institución (titular + co-titular)"
          value={money(c.creditoInstitucion)}
        />
        <Fila label="Crédito directo (pagaré)" value={money(c.montoCreditoDirecto)} />
        <Fila label="Depósitos directos del cliente" value={money(c.depositosDirectoCliente)} />
        <Fila label="Monto disponible para operación" value={money(c.montoDisponible)} strong />
        <div className="my-1 border-t border-[var(--border)]" />
        <Fila
          label={c.cubierta ? 'Saldo (cubierta)' : 'Saldo pendiente'}
          value={money(c.saldoCliente)}
          strong
          tone={c.cubierta ? 'ok' : 'warn'}
        />
      </Bloque>

      {/* Derivados de cierre */}
      <Bloque titulo="Cierre (valores derivados)">
        <Fila
          label={`Cheque a notaría ${chequeCapturado ? '(capturado)' : '(calculado)'}`}
          value={money(c.chequeNotariaUsado)}
          hint={chequeCapturado ? `Sugerido: ${money(c.chequeNotariaCalculado)}` : undefined}
        />
        <Fila label="Depósitos recibidos (todos)" value={money(c.depositosRecibidos)} />
        <Fila label="Valor real venta Dilesa" value={money(c.valorRealVentaDilesa)} strong />
        <Fila label="Valor facturado" value={money(c.valorFacturado)} />
        <Fila label="Monto nota de crédito" value={money(c.montoNotaCredito)} />
        <Fila label="Descuento real" value={money(c.descuentoReal)} />
      </Bloque>

      {/* Comisiones */}
      <Bloque titulo="Comisiones">
        <Fila label="Comisión vendedor" value={money(c.comisionVendedor)} />
        <Fila label="Comisión gerencia" value={money(c.comisionGerencia)} />
      </Bloque>

      <p className="text-[11px] leading-relaxed text-[var(--text)]/45">
        Valores derivados según las fórmulas de Coda. Algunos quedan aproximados hasta capturar
        (Sprint 2) el apoyo de Infonavit por tipo de crédito, los buckets de descuento otorgado y el
        recibo de caja por depósito (define el Valor Facturado).
      </p>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
        {titulo}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Fila({
  label,
  value,
  strong = false,
  tone,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'ok' | 'warn';
  hint?: string;
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[var(--text)]';
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? 'font-medium text-[var(--text)]/80' : 'text-[var(--text)]/65'}>
        {label}
        {hint ? <span className="ml-2 text-[10px] text-[var(--text)]/40">{hint}</span> : null}
      </span>
      <span className={`${strong ? 'text-base font-semibold' : 'font-medium'} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}
