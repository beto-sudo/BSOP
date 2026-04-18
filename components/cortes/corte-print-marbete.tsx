import { formatCurrency, formatDate, formatDateTime } from './helpers';
import type { Corte, CorteTotales, Movimiento } from './types';

/**
 * Print-only marbete (voucher) for a corte de caja.
 * Rendered inside the detail Sheet but hidden except when the user presses
 * "Imprimir" (Marbete) — then a `print:block` rule reveals it and the rest of
 * the Sheet is hidden via `print:hidden`. Matches the layout operations use
 * when reconciling cash drawers.
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
    <div className="hidden print:block mb-6 text-sm">
      <div className="flex items-start justify-between border-b pb-3 mb-4">
        <div>
          <div className="text-lg font-bold">Rincón del Bosque</div>
          <div className="text-xs text-gray-500">Corte de Caja</div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{corte.corte_nombre ?? corte.id}</div>
          <div className="text-xs text-gray-500">{formatDateTime(corte.hora_inicio)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
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
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-2">
        Ingresos
      </div>
      <table className="w-full border-collapse text-xs mb-1">
        <tbody>
          <tr className="border-t">
            <td className="py-0.5 text-gray-500">Efectivo inicial</td>
            <td className="text-right font-medium">{formatCurrency(corte.efectivo_inicial)}</td>
          </tr>
          <tr className="border-t">
            <td className="py-0.5 text-gray-500">Ingresos efectivo</td>
            <td className="text-right font-medium">{formatCurrency(totales?.ingresos_efectivo)}</td>
          </tr>
          {(totales?.ingresos_tarjeta ?? 0) !== 0 && (
            <tr className="border-t">
              <td className="py-0.5 text-gray-500">Ingresos tarjeta</td>
              <td className="text-right font-medium">
                {formatCurrency(totales?.ingresos_tarjeta)}
              </td>
            </tr>
          )}
          {(totales?.ingresos_stripe ?? 0) !== 0 && (
            <tr className="border-t">
              <td className="py-0.5 text-gray-500">Ingresos Stripe</td>
              <td className="text-right font-medium">{formatCurrency(totales?.ingresos_stripe)}</td>
            </tr>
          )}
          {(totales?.ingresos_transferencias ?? 0) !== 0 && (
            <tr className="border-t">
              <td className="py-0.5 text-gray-500">Transferencias</td>
              <td className="text-right font-medium">
                {formatCurrency(totales?.ingresos_transferencias)}
              </td>
            </tr>
          )}
          {(totales?.depositos ?? 0) !== 0 && (
            <tr className="border-t">
              <td className="py-0.5 text-gray-500">Depósitos</td>
              <td className="text-right font-medium">{formatCurrency(totales?.depositos)}</td>
            </tr>
          )}
          <tr className="border-t border-gray-400 font-semibold">
            <td className="py-1">Total ingresos</td>
            <td className="text-right">{formatCurrency(totales?.total_ingresos)}</td>
          </tr>
        </tbody>
      </table>

      {/* EGRESOS / MOVIMIENTOS DE CAJA */}
      {movimientos.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
            Egresos / Movimientos de caja
          </div>
          <table className="w-full border-collapse text-xs mb-1">
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-0.5">
                    <span className="text-gray-700 capitalize">{m.nota || m.tipo}</span>
                    <span className="block text-gray-400 text-[10px]">
                      {formatDate(m.fecha_hora)}
                    </span>
                  </td>
                  <td className="text-right font-medium text-red-700">{formatCurrency(m.monto)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-400 font-semibold">
                <td className="py-1">Total egresos</td>
                <td className="text-right text-red-700">
                  {formatCurrency(movimientos.reduce((s, m) => s + (m.monto ?? 0), 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* CIERRE */}
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 mt-3">
        Cierre
      </div>
      <table className="w-full border-collapse text-xs mb-4">
        <tbody>
          <tr className="border-t">
            <td className="py-0.5 text-gray-500">Efectivo esperado</td>
            <td className="text-right font-medium">{formatCurrency(efectivoEsperado)}</td>
          </tr>
          <tr className="border-t">
            <td className="py-0.5 text-gray-500">Efectivo contado</td>
            <td className="text-right font-medium">{formatCurrency(corte.efectivo_contado)}</td>
          </tr>
          <tr className="border-t border-gray-400 font-semibold">
            <td className="py-1">Diferencia</td>
            <td
              className={`text-right ${diferencia > 0 ? 'text-green-700' : diferencia < 0 ? 'text-red-700' : ''}`}
            >
              {diferencia !== 0 ? formatCurrency(diferencia) : '—'}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="border-t border-gray-400 mt-8 pt-1 text-center text-gray-500">
            Responsable de apertura
          </div>
        </div>
        <div>
          <div className="border-t border-gray-400 mt-8 pt-1 text-center text-gray-500">
            Responsable de cierre
          </div>
        </div>
      </div>
    </div>
  );
}
