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
  /**
   * Resolución del saldo residual de precio (iniciativa `dilesa-saldos-residuales`):
   * cuando hay residual, Dirección decide en la dictaminación cobrarlo (pagaré) o
   * absorberlo (nota de crédito). `null`/sin resolución ⇒ el panel muestra la nota
   * pendiente. NO cambia ningún número (la NC sigue derivada); solo la etiqueta del
   * "Saldo por cubrir".
   */
  saldoResidual?: { resolucion: 'cobrar' | 'absorber' | null; monto: number | null } | null;
};

export function CuadraturaPanel({
  cuadratura: c,
  valorEscrituracion,
  chequeCapturado,
  hayFacturaCfdi,
  saldoResidual,
}: CuadraturaPanelProps) {
  // Cobertura del presupuesto notarial COMPLETO: el motor (`coberturaGastos`) ya
  // trae todos los componentes y el saldo — fuente única, el panel no recalcula.
  const cob = c.coberturaGastos;
  // Saldo del precio que el enganche pagado aún no cubre. Si el cliente no lo
  // completa antes de escriturar, lo absorbe el bono de DILESA (entra al descuento).
  // Fuente única en el motor (`cuadratura.ts`) — no recalcular aquí (lo mismo que
  // muestra el mini-resumen de la cabecera).
  const saldoPrecioPorCubrir = c.saldoPrecioPorCubrir ?? 0;
  // Resolución del residual (iniciativa dilesa-saldos-residuales): si Dirección ya
  // lo cobró (pagaré) o absorbió (NC) en la dictaminación, la etiqueta lo refleja
  // en vez de la nota suave "lo absorbe el bono". No cambia ningún monto.
  const resolucion = saldoResidual?.resolucion ?? null;
  const saldoCubierto = saldoPrecioPorCubrir <= 0.5;
  const saldoLabel = saldoCubierto
    ? '(=) Precio cubierto ✓'
    : resolucion === 'absorber'
      ? '(=) Absorbido por DILESA (nota de crédito)'
      : resolucion === 'cobrar'
        ? '(=) Por cobrar (pagaré)'
        : '(=) Saldo por cubrir';
  const saldoTone: 'ok' | 'warn' = saldoCubierto || resolucion === 'absorber' ? 'ok' : 'warn';
  const saldoNota = saldoCubierto
    ? 'El precio queda cubierto entre el crédito y el enganche; los gastos de escrituración se desglosan abajo.'
    : resolucion === 'absorber'
      ? 'DILESA absorbe este saldo con una nota de crédito (autorizada por Dirección). Ya entra al descuento de la operación; la NC se emite al facturar.'
      : resolucion === 'cobrar'
        ? 'El cliente cubre este saldo con un pagaré (autorizado por Dirección).'
        : 'Saldo pendiente del cliente. En la dictaminación, Dirección lo resuelve: cobrarlo (pagaré) o absorberlo (nota de crédito). Los gastos de escrituración se desglosan abajo.';
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
          {c.formacionPrecio.productos > 0 ? (
            <Fila
              label="(+) Productos adicionales (closets, upgrades)"
              value={money(c.formacionPrecio.productos)}
            />
          ) : null}
          {c.formacionPrecio.sobreprecioGastos > 0 ? (
            <Fila
              label="(+) Sobreprecio para gastos de escrituración"
              value={money(c.formacionPrecio.sobreprecioGastos)}
            />
          ) : null}
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label="(=) Precio de escrituración"
            value={money(c.formacionPrecio.valorEscrituracion)}
            strong
          />
        </Bloque>
      ) : c.precioAsignacion > 0 ? (
        /* Resumen de precio para el legacy (sin desglose): empareja en claridad
           con la card "Formación del precio" del modelo desglosado. No recalcula —
           lee precioAsignacion + valorReal del motor. */
        <Bloque titulo="Resumen de precio">
          <Fila label="Precio de asignación (lista)" value={money(c.precioAsignacion)} />
          <Fila
            label="Valor escriturado"
            value={money(valorEscrituracion)}
            hint="el valor que se factura"
          />
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          <Fila
            label="(=) Valor real venta Dilesa"
            value={money(c.valorRealVentaDilesa)}
            strong
            tone="ok"
            formula="lo que DILESA realiza, neto"
          />
          {c.precioAsignacion - c.valorRealVentaDilesa > 0.5 ? (
            <Fila
              label="Bono al cliente"
              value={money(c.precioAsignacion - c.valorRealVentaDilesa)}
              formula="precio de asignación − valor real"
            />
          ) : null}
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
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          {(c.saldoPrecioEscrituracion ?? 0) > 0.5 && cob ? (
            <>
              <Fila
                label="(=) Saldo del precio (a cargo del cliente)"
                value={money(c.saldoPrecioEscrituracion)}
                strong
              />
              <Fila
                label="(−) Enganche pagado por el cliente"
                value={money(cob.engancheAlPrecio)}
              />
              <div className="my-1 border-t border-[var(--border)]" />
              <Fila
                label={saldoLabel}
                value={money(saldoPrecioPorCubrir)}
                strong
                tone={saldoTone}
              />
              <p className="mt-1 text-[11px] text-[var(--text)]/45">{saldoNota}</p>
            </>
          ) : (
            <>
              <Fila
                label="(=) Saldo del precio (cubierto)"
                value={money(c.saldoPrecioEscrituracion)}
                strong
                tone="ok"
              />
              <p className="mt-1 text-[11px] text-[var(--text)]/45">
                El precio lo cubre el crédito; los gastos de escrituración se desglosan abajo.
              </p>
            </>
          )}
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

      {/* Cobertura del presupuesto notarial COMPLETO (ADR-045). Gastos brutos =
          subsidio Infonavit + aportación DILESA (promoción) + enganche +
          sobreprecio + pagaré → saldo 0. */}
      {c.tieneDesglose && cob ? (
        <Bloque titulo="Cobertura del presupuesto notarial">
          <Fila label="Gastos notariales (completos)" value={money(cob.gastosBrutos)} strong />
          <div className="my-1 border-t border-dashed border-[var(--border)]" />
          {cob.apoyoInfonavit > 0 ? (
            <Fila label="(−) Subsidio Infonavit" value={money(cob.apoyoInfonavit)} />
          ) : null}
          <Fila label="(−) Aportación DILESA (promoción)" value={money(cob.aportacionPromocion)} />
          <Fila label="(−) Enganche del cliente" value={money(cob.engancheCliente)} />
          <Fila
            label="(−) Sobreprecio"
            value={money(cob.sobreprecioCobertura)}
            hint={
              cob.sobreprecioCobertura > 0 && cob.sobreprecioCobertura < 1
                ? 'residuo de redondeo del enganche'
                : undefined
            }
          />
          {/* Solo la parte del pagaré que fondea GASTOS — el resto (si lo hay)
              financia el residual de precio y se ve en la card de cobertura del precio. */}
          <Fila label="(−) Pagaré del cliente" value={money(cob.pagareGastos)} />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label={Math.abs(cob.saldoCobertura) <= 2 ? '(=) Cuadra ✓' : '(=) Saldo'}
            value={money(cob.saldoCobertura)}
            strong
            tone={Math.abs(cob.saldoCobertura) <= 2 ? 'ok' : 'warn'}
          />
          {cob.engancheAlPrecio > 0 ? (
            <p className="mt-1 text-[11px] text-[var(--text)]/45">
              El enganche del cliente ({money(cob.engancheAlPrecio + cob.engancheCliente)}) cubre
              primero el precio; aquí solo cuenta el excedente que fondea los gastos.
            </p>
          ) : null}
        </Bloque>
      ) : null}

      {/* Facturación de la venta — desglose (ADR-045). Proyección hasta que se
          emita el CFDI (la factura de escrituración + la NC nacen al escriturar). */}
      {c.desgloseFacturacion ? (
        <Bloque
          titulo={
            hayFacturaCfdi ? 'Facturación de la venta' : 'Facturación de la venta (proyectada)'
          }
        >
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
            label="(−) Nota de crédito"
            value={money(c.desgloseFacturacion.notaCredito)}
            hint="Acredita el enganche facturado 2× (escritura + recibo) más el descuento real"
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <Fila
            label="(=) Neto facturado (ingreso real DILESA)"
            value={money(c.desgloseFacturacion.netoFacturado)}
            strong
            tone="ok"
            hint={`Escrituración ${money(valorEscrituracion)} − descuento real ${money(c.descuentoReal)}`}
          />
          {!hayFacturaCfdi ? (
            <p className="mt-1 text-[11px] text-[var(--text)]/45">
              Proyección: la venta aún no se factura. La factura de escrituración y la nota de
              crédito se emiten al escriturar; los montos son los esperados con los datos de hoy.
            </p>
          ) : null}
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
        <Fila
          label="Valor real venta Dilesa"
          value={money(c.valorRealVentaDilesa)}
          strong
          formula={
            c.tieneDesglose
              ? 'detonación + enganche − cheque + pagaré'
              : 'depósitos − cheque + pagaré'
          }
        />
        <Fila
          label={`Valor facturado ${hayFacturaCfdi ? '(CFDI)' : '(sugerido)'}`}
          value={money(c.valorFacturado)}
          hint={hayFacturaCfdi ? `Sugerido: ${money(c.valorFacturadoSugerido)}` : undefined}
          formula="escrituración + enganche con recibo CFDI"
        />
        <Fila
          label={`Monto nota de crédito ${hayFacturaCfdi ? '(requerida)' : '(sugerido)'}`}
          value={money(c.montoNotaCredito)}
          hint={hayFacturaCfdi ? `Sugerido: ${money(c.montoNotaCreditoSugerido)}` : undefined}
          formula="valor facturado − valor real"
        />
        <Fila
          label="Descuento real"
          value={money(c.descuentoReal)}
          formula="escrituración − valor real"
        />
      </Bloque>

      {/* Comisiones */}
      <Bloque titulo="Comisiones">
        <Fila
          label="Comisión vendedor"
          value={money(c.comisionVendedor)}
          formula="1% del valor real (1.5% en Loma Verde)"
        />
        <Fila
          label="Comisión gerencia"
          value={money(c.comisionGerencia)}
          formula="0.5% del valor real"
        />
      </Bloque>

      <p className="text-[11px] leading-relaxed text-[var(--text)]/45">
        {c.tieneDesglose ? (
          <>
            Modelo desglosado (Michelle/Ale): el <strong>Valor real venta Dilesa</strong> es lo que
            DILESA realiza neto del cheque a notaría (detonación + enganche − cheque + pagaré); la{' '}
            <strong>Nota de Crédito</strong> = Valor Facturado − Valor real; el{' '}
            <strong>Descuento real</strong> = Escrituración − Valor real; y las comisiones van sobre
            el Valor real menos el sobreprecio para gastos. Con factura emitida, el Valor Facturado
            es el del CFDI; antes de facturar se estima con el valor de escrituración («sugerido»).
          </>
        ) : (
          <>
            Con factura emitida, el Valor Facturado es el del CFDI y la Nota de Crédito se deriva
            como Valor Facturado − Valor real venta Dilesa; antes de facturar, la fórmula de Coda
            los estima como «sugerido». Las comisiones van sobre el Valor real (igual que el modelo
            desglosado); el resto de los derivados queda aproximado hasta capturar el apoyo de
            Infonavit por tipo de crédito y los buckets de descuento otorgado.
          </>
        )}{' '}
        Las comisiones mostradas son la <strong>base</strong> (porcentaje sobre el valor real); la
        comisión pagada aplica encima el esquema de objetivos y cuotas trimestrales.
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
  formula,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'ok' | 'warn';
  hint?: string;
  /** Fórmula de cómo se obtiene el monto, en subtítulo gris bajo el label
   *  (iniciativa `dilesa-comision-valor-real`: hacer explícito de dónde sale cada
   *  número, sin sacar al usuario del panel). */
  formula?: string;
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
        {formula ? (
          <span className="mt-0.5 block text-[10px] font-normal text-[var(--text)]/40">
            {formula}
          </span>
        ) : null}
      </span>
      <span className={`${strong ? 'text-base font-semibold' : 'font-medium'} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}
