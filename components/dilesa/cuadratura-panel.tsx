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

import { AlertTriangle } from 'lucide-react';

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
  /**
   * Ya existe el CFDI de factura (adjunto rol='factura_xml'), no solo un
   * snapshot de Coda en `valor_facturado` (= escrituración, sin factura real).
   * Con factura, el motor ya trae `valorFacturado` del CFDI real y la NC
   * derivada de él; aquí solo define la etiqueta «CFDI/requerida» vs «sugerido».
   */
  hayFacturaCfdi: boolean;
};

export function CuadraturaPanel({
  cuadratura: c,
  valorEscrituracion,
  chequeCapturado,
  hayFacturaCfdi,
}: CuadraturaPanelProps) {
  return (
    <div className="space-y-5">
      {c.posibleDobleConteo ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Posible doble conteo:</strong> los depósitos fuente «Cliente» (
            {money(c.depositosDirectoCliente)}) más el crédito de institución (
            {money(c.creditoInstitucion)}) exceden el valor de escrituración. Revisa si la
            disposición del crédito se capturó como abono con fuente «Cliente» — ese dinero estaría
            contando dos veces en el disponible.
          </p>
        </div>
      ) : null}

      {/* Formación del precio de escrituración (ADR-045 + geometría 20260618) */}
      {c.formacionPrecio ? (
        <Bloque titulo="Formación del precio de escrituración">
          <Fila label="Precio base (valor comercial)" value={money(c.formacionPrecio.precioBase)} />
          {c.formacionPrecio.valorExcedenteTerreno > 0 ? (
            <Fila
              label="(+) Excedente de terreno"
              value={money(c.formacionPrecio.valorExcedenteTerreno)}
            />
          ) : null}
          {c.formacionPrecio.valorFrenteVerde > 0 ? (
            <Fila label="(+) Frente verde" value={money(c.formacionPrecio.valorFrenteVerde)} />
          ) : null}
          {c.formacionPrecio.valorEsquina > 0 ? (
            <Fila label="(+) Esquina" value={money(c.formacionPrecio.valorEsquina)} />
          ) : null}
          {c.formacionPrecio.valorVentaFuturo > 0 ? (
            <Fila label="(+) Venta futuro" value={money(c.formacionPrecio.valorVentaFuturo)} />
          ) : null}
          <Fila
            label="(+) Incremento por crédito (FOVISSSTE/IMSS)"
            value={money(c.formacionPrecio.incrementoCredito)}
          />
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          <Fila
            label="(=) Precio interno DILESA"
            value={money(c.formacionPrecio.precioInterno)}
            strong
          />
          <Fila label="(+) Adicionales (productos)" value={money(c.formacionPrecio.adicionales)} />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label="(=) Precio de escrituración"
            value={money(c.formacionPrecio.valorEscrituracion)}
            strong
          />
        </Bloque>
      ) : null}

      {/* Cobertura del precio. Con desglose: simple (el precio lo cubre el
          crédito; los gastos van en su propia card). Sin desglose: fórmula vieja. */}
      {c.tieneDesglose ? (
        <Bloque titulo="Cobertura del precio de escrituración">
          <Fila label="Valor de escrituración" value={money(valorEscrituracion)} />
          <Fila
            label="(−) Crédito institución (titular + co-titular)"
            value={money(c.creditoInstitucion)}
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label={
              (c.saldoPrecioEscrituracion ?? 0) <= 0
                ? '(=) Saldo del precio (cubierto)'
                : '(=) Saldo del precio'
            }
            value={money(c.saldoPrecioEscrituracion)}
            strong
            tone={(c.saldoPrecioEscrituracion ?? 0) <= 0 ? 'ok' : 'warn'}
          />
          <p className="mt-1 text-[11px] text-[var(--text)]/45">
            El precio lo cubre el crédito; los gastos de escrituración se desglosan abajo.
          </p>
        </Bloque>
      ) : (
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
          {c.descuentoOtorgado > 0 || c.chequePagado > 0 ? (
            <>
              <Fila
                label="(+) Descuento aplicado"
                value={money(c.descuentoAplicado)}
                hint={
                  c.descuentoAplicado < c.descuentoOtorgado
                    ? `Otorgado ${money(c.descuentoOtorgado)} · topado al autorizado`
                    : undefined
                }
              />
              {c.chequePagado > 0 ? (
                <Fila label="(−) Cheque a notaría girado" value={money(c.chequePagado)} />
              ) : null}
            </>
          ) : null}
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label={c.cubierta ? 'Saldo (cubierta)' : 'Saldo pendiente'}
            value={money(c.saldoCliente)}
            strong
            tone={c.cubierta ? 'ok' : 'warn'}
            hint={
              c.descuentoOtorgado > 0 || c.chequePagado > 0
                ? `Cobranza cruda: ${money(c.saldoCobranza)}`
                : undefined
            }
          />
        </Bloque>
      )}

      {/* Cobertura del presupuesto notarial — las 4 fuentes (ADR-045) */}
      {c.tieneDesglose && c.coberturaGastos ? (
        <Bloque titulo="Cobertura del presupuesto notarial">
          <Fila
            label="Presupuesto notarial (neto de apoyo Infonavit)"
            value={money(c.coberturaGastos.gastosNetos)}
            strong
          />
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          <Fila label="(−) Promoción DILESA (bono)" value={money(c.coberturaGastos.promocion)} />
          <Fila label="(−) Enganche del cliente" value={money(c.coberturaGastos.engancheCliente)} />
          <Fila
            label="(−) Sobreprecio (productos adicionales)"
            value={money(c.coberturaGastos.sobreprecio)}
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label="(=) Pagaré necesario del cliente"
            value={money(c.coberturaGastos.pagareNecesario)}
            strong
            tone={c.coberturaGastos.pagareNecesario > 0 ? 'warn' : 'ok'}
          />
        </Bloque>
      ) : null}

      {/* Facturación de la venta — desglose (ADR-045) */}
      {c.desgloseFacturacion ? (
        <Bloque titulo="Facturación de la venta">
          <Fila
            label="Factura de la venta (escrituración)"
            value={money(c.desgloseFacturacion.facturaVenta)}
          />
          <Fila
            label="(+) Factura de enganche (recibo CFDI)"
            value={money(c.desgloseFacturacion.facturaEnganche)}
          />
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          <Fila
            label="(=) Total facturado"
            value={money(c.desgloseFacturacion.totalFacturado)}
            strong
          />
          <Fila
            label="(−) Nota de crédito (acredita el enganche)"
            value={money(c.desgloseFacturacion.notaCredito)}
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label="(=) Neto facturado (= escrituración)"
            value={money(c.desgloseFacturacion.netoFacturado)}
            strong
            tone="ok"
          />
        </Bloque>
      ) : null}

      {/* Derivados de cierre */}
      <Bloque titulo="Cierre (valores derivados)">
        <Fila
          label={`Cheque a notaría ${chequeCapturado ? '(capturado)' : '(calculado)'}`}
          value={money(c.chequeNotariaUsado)}
          hint={chequeCapturado ? `Sugerido: ${money(c.chequeNotariaCalculado)}` : undefined}
        />
        <Fila label="Depósitos recibidos (todos)" value={money(c.depositosRecibidos)} />
        <Fila label="Valor real venta Dilesa" value={money(c.valorRealVentaDilesa)} strong />
        <Fila
          label={`Valor facturado ${hayFacturaCfdi ? '(CFDI)' : '(sugerido)'}`}
          value={money(c.valorFacturado)}
          hint={hayFacturaCfdi ? `Sugerido: ${money(c.valorFacturadoSugerido)}` : undefined}
        />
        <Fila
          label={`Monto nota de crédito ${hayFacturaCfdi ? '(requerida)' : '(sugerido)'}`}
          value={money(c.montoNotaCredito)}
          hint={hayFacturaCfdi ? `Sugerido: ${money(c.montoNotaCreditoSugerido)}` : undefined}
        />
        <Fila label="Descuento real" value={money(c.descuentoReal)} />
      </Bloque>

      {/* Comisiones */}
      <Bloque titulo="Comisiones">
        <Fila label="Comisión vendedor" value={money(c.comisionVendedor)} />
        <Fila label="Comisión gerencia" value={money(c.comisionGerencia)} />
      </Bloque>

      <p className="text-[11px] leading-relaxed text-[var(--text)]/45">
        Con factura emitida, el Valor Facturado es el del CFDI y la Nota de Crédito se deriva como
        Valor Facturado − Valor real venta Dilesa; antes de facturar, la fórmula de Coda los estima
        como «sugerido». El resto de los derivados sigue las fórmulas de Coda y queda aproximado
        hasta capturar el apoyo de Infonavit por tipo de crédito y los buckets de descuento
        otorgado.
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
