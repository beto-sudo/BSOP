import type { ConciliacionEfectivo, ConciliacionEstado, ConciliacionTarjeta } from './conciliacion';
import { formatCurrency, formatDate, formatDateTime } from './helpers';
import type { Corte, CorteTotales, Movimiento } from './types';

/**
 * Print-only marbete (voucher) for a corte de caja.
 * Rendered inside the detail Sheet but hidden except when the user presses
 * "Imprimir" (Marbete) — then `print:block` lo revela y el ScrollArea con el
 * detalle de pantalla queda `print:hidden`.
 *
 * Diseñado para caber en UNA SOLA hoja carta sin reglas `@page` (para no
 * romper el control "Escala" del diálogo de impresión). Texto base 10px,
 * headers 9px, fechas 8px, padding mínimo y `pageBreakInside: avoid` por
 * bloque. Si un corte tiene >12 movimientos puede desbordar — el usuario
 * puede ajustar manualmente con Escala 90/95% en el diálogo.
 */

// Etiquetas en texto plano para impresión (los íconos / colores de los badges
// no pintan bien en B&W). Coincide con `ESTADO_BADGE` de corte-conciliacion.tsx.
const ESTADO_LABEL_PRINT: Record<ConciliacionEstado, string> = {
  cuadra: 'Cuadra',
  cuadra_aprox: 'Cuadra ±',
  diferencia: 'Diferencia',
  sin_voucher: 'Sin voucher',
  pendiente_captura: 'Pendiente captura',
  pendiente_cierre: 'Pendiente cierre',
  sin_actividad: 'Sin actividad',
};

export function CortePrintMarbete({
  corte,
  totales,
  movimientos,
  tarjeta,
  efectivo,
  ingresosStripe,
  ingresosTransferencias,
  efectivoEsperado,
  diferencia,
}: {
  corte: Corte;
  totales: CorteTotales | null;
  movimientos: Movimiento[];
  tarjeta: ConciliacionTarjeta;
  efectivo: ConciliacionEfectivo;
  ingresosStripe: number;
  ingresosTransferencias: number;
  efectivoEsperado: number;
  diferencia: number;
}) {
  return (
    <div className="hidden print:block print:text-[10px] print:leading-tight">
      <div className="flex items-start justify-between border-b pb-2 mb-2">
        <div>
          <div className="text-base font-bold">Rincón del Bosque</div>
          <div className="text-[9px] text-gray-500">Corte de Caja</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{corte.corte_nombre ?? corte.id}</div>
          <div className="text-[9px] text-gray-500">{formatDateTime(corte.hora_inicio)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-2" style={{ pageBreakInside: 'avoid' }}>
        <div>
          <span className="text-gray-500">Caja:</span> <strong>{corte.caja_nombre}</strong>
        </div>
        <div>
          <span className="text-gray-500">Estado:</span> <strong>{corte.estado}</strong>
        </div>
        <div>
          <span className="text-gray-500">Apertura:</span> {formatDateTime(corte.hora_inicio)}
        </div>
        <div>
          <span className="text-gray-500">Cierre:</span> {formatDateTime(corte.hora_fin)}
        </div>
        <div>
          <span className="text-gray-500">Responsable:</span> {corte.responsable_apertura ?? '—'}
        </div>
        <div>
          <span className="text-gray-500">Pedidos:</span> {corte.pedidos_count ?? '—'}
        </div>
      </div>
      {/* INGRESOS */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5 mt-1">
          Ingresos
        </div>
        <table className="w-full border-collapse text-[10px] mb-1">
          <tbody>
            <tr className="border-t">
              <td className="py-0 text-gray-500">Efectivo inicial</td>
              <td className="text-right font-medium">{formatCurrency(corte.efectivo_inicial)}</td>
            </tr>
            <tr className="border-t">
              <td className="py-0 text-gray-500">Ingresos efectivo</td>
              <td className="text-right font-medium">
                {formatCurrency(totales?.ingresos_efectivo)}
              </td>
            </tr>
            {(totales?.ingresos_tarjeta ?? 0) !== 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Ingresos tarjeta</td>
                <td className="text-right font-medium">
                  {formatCurrency(totales?.ingresos_tarjeta)}
                </td>
              </tr>
            )}
            {(totales?.ingresos_stripe ?? 0) !== 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Ingresos Stripe</td>
                <td className="text-right font-medium">
                  {formatCurrency(totales?.ingresos_stripe)}
                </td>
              </tr>
            )}
            {(totales?.ingresos_transferencias ?? 0) !== 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Transferencias</td>
                <td className="text-right font-medium">
                  {formatCurrency(totales?.ingresos_transferencias)}
                </td>
              </tr>
            )}
            {(totales?.depositos ?? 0) !== 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Depósitos</td>
                <td className="text-right font-medium">{formatCurrency(totales?.depositos)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-400 font-semibold">
              <td className="py-0.5">Total ingresos</td>
              <td className="text-right">{formatCurrency(totales?.total_ingresos)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* EGRESOS / MOVIMIENTOS DE CAJA */}
      {movimientos.length > 0 && (
        <div style={{ pageBreakInside: 'avoid' }}>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5 mt-1">
            Egresos / Movimientos de caja
          </div>
          <table className="w-full border-collapse text-[10px] mb-1">
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-0">
                    <span className="text-gray-700 capitalize">{m.nota || m.tipo}</span>
                    <span className="text-gray-400 text-[8px]"> · {formatDate(m.fecha_hora)}</span>
                  </td>
                  <td className="text-right font-medium text-red-700">{formatCurrency(m.monto)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-400 font-semibold">
                <td className="py-0.5">Total egresos</td>
                <td className="text-right text-red-700">
                  {formatCurrency(movimientos.reduce((s, m) => s + (m.monto ?? 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* CONCILIACIÓN */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5 mt-1">
          Conciliación
        </div>
        <table className="w-full border-collapse text-[10px] mb-1">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <tbody>
            <tr className="border-t">
              <td className="py-0 align-top text-gray-500">Tarjeta</td>
              <td className="py-0 align-top text-gray-700">
                Pedidos {formatCurrency(tarjeta.ingresos_pedidos)} · Σ Vouchers{' '}
                {formatCurrency(tarjeta.total_evidencia)} ({tarjeta.evidencia_count})
                {tarjeta.evidencia_pendiente > 0
                  ? `, faltan ${tarjeta.evidencia_pendiente} ${tarjeta.evidencia_pendiente === 1 ? 'monto' : 'montos'}`
                  : ''}
              </td>
              <td className="py-0 align-top text-right text-[9px] italic text-gray-600">
                {ESTADO_LABEL_PRINT[tarjeta.estado]}
              </td>
              <td className="py-0 align-top text-right font-medium tabular-nums">
                {tarjeta.evidencia_pendiente > 0 ? '—' : formatCurrency(tarjeta.diferencia)}
              </td>
            </tr>
            <tr className="border-t">
              <td className="py-0 align-top text-gray-500">Efectivo</td>
              <td className="py-0 align-top text-gray-700">
                Esperado {formatCurrency(efectivo.esperado)} · Contado{' '}
                {efectivo.contado != null ? formatCurrency(efectivo.contado) : '—'}
              </td>
              <td className="py-0 align-top text-right text-[9px] italic text-gray-600">
                {ESTADO_LABEL_PRINT[efectivo.estado]}
              </td>
              <td className="py-0 align-top text-right font-medium tabular-nums">
                {efectivo.diferencia != null ? formatCurrency(efectivo.diferencia) : '—'}
              </td>
            </tr>
            {ingresosStripe > 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Stripe</td>
                <td className="py-0 text-[9px] italic text-gray-400">
                  Conciliación contra liquidación Stripe — pendiente
                </td>
                <td className="py-0" />
                <td className="py-0 text-right font-medium tabular-nums">
                  {formatCurrency(ingresosStripe)}
                </td>
              </tr>
            )}
            {ingresosTransferencias > 0 && (
              <tr className="border-t">
                <td className="py-0 text-gray-500">Transferencias</td>
                <td className="py-0 text-[9px] italic text-gray-400">
                  Conciliación contra estado de cuenta — pendiente
                </td>
                <td className="py-0" />
                <td className="py-0 text-right font-medium tabular-nums">
                  {formatCurrency(ingresosTransferencias)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CIERRE */}
      <div style={{ pageBreakInside: 'avoid' }}>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5 mt-1">
          Cierre
        </div>
        <table className="w-full border-collapse text-[10px] mb-2">
          <tbody>
            <tr className="border-t">
              <td className="py-0 text-gray-500">Efectivo esperado</td>
              <td className="text-right font-medium">{formatCurrency(efectivoEsperado)}</td>
            </tr>
            <tr className="border-t">
              <td className="py-0 text-gray-500">Efectivo contado</td>
              <td className="text-right font-medium">{formatCurrency(corte.efectivo_contado)}</td>
            </tr>
            <tr className="border-t border-gray-400 font-semibold">
              <td className="py-0.5">Diferencia</td>
              <td
                className={`text-right ${diferencia > 0 ? 'text-green-700' : diferencia < 0 ? 'text-red-700' : ''}`}
              >
                {diferencia !== 0 ? formatCurrency(diferencia) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        className="mt-3 pt-2 border-t grid grid-cols-2 gap-6 text-[9px]"
        style={{ pageBreakInside: 'avoid' }}
      >
        <div>
          <div className="border-t border-gray-400 mt-6 pt-0.5 text-center text-gray-500">
            Responsable de apertura
          </div>
        </div>
        <div>
          <div className="border-t border-gray-400 mt-6 pt-0.5 text-center text-gray-500">
            Responsable de cierre
          </div>
        </div>
      </div>
    </div>
  );
}
