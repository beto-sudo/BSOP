import { formatCurrency, formatDate, formatDateTime } from './helpers';
import type { Corte, CorteTotales, Movimiento } from './types';

/**
 * Print-only marbete (voucher) for a corte de caja.
 * Rendered inside the detail Sheet but hidden except when the user presses
 * "Imprimir" (Marbete) — then a `print:block` rule reveals it and the rest of
 * the Sheet is hidden via `print:hidden`. Matches the layout operations use
 * when reconciling cash drawers.
 *
 * Diseñado para caber en UNA SOLA hoja carta. Los `print:` modifiers reducen
 * tamaños y márgenes; el `@page { size: letter; margin: 0.4in }` global limita
 * el área de impresión. `page-break-inside: avoid` en cada bloque impide
 * cortes feos a media tabla. Si el corte tiene más de ~12 movimientos, podría
 * desbordar — en ese caso ajustar `print:text-[8px]` o usar 2 hojas.
 */
export function CortePrintMarbete({
  corte,
  totales,
  movimientos,
  efectivoEsperado,
  diferencia,
}: {
  corte: Corte;
  totales: CorteTotales | null;
  movimientos: Movimiento[];
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
