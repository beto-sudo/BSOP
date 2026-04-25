import type { ConciliacionEfectivo, ConciliacionEstado, ConciliacionTarjeta } from './conciliacion';
import { formatCurrency } from './helpers';
import type { Voucher } from './types';

const SIMBOLO: Record<ConciliacionEstado, string> = {
  cuadra: '✓',
  cuadra_aprox: '~',
  diferencia: '✗',
  sin_voucher: '✗',
  pendiente_captura: '•',
  pendiente_cierre: '○',
  sin_actividad: '—',
};

const ETIQUETA: Record<ConciliacionEstado, string> = {
  cuadra: 'Cuadra',
  cuadra_aprox: 'Cuadra ±',
  diferencia: 'Diferencia',
  sin_voucher: 'Sin voucher',
  pendiente_captura: 'Pendiente captura',
  pendiente_cierre: 'Pendiente cierre',
  sin_actividad: 'Sin actividad',
};

type Props = {
  tarjeta: ConciliacionTarjeta;
  efectivo: ConciliacionEfectivo;
  ingresosStripe: number;
  ingresosTransferencias: number;
  vouchersTarjeta: Voucher[];
  bancoNombrePor: (id: string | null) => string | null;
};

// Versión print-only de la conciliación. Usa símbolos en lugar de color porque
// el marbete suele imprimirse en B&W — los iconos sobreviven, los tonos no.
export function MarbeteConciliacion({
  tarjeta,
  efectivo,
  ingresosStripe,
  ingresosTransferencias,
  vouchersTarjeta,
  bancoNombrePor,
}: Props) {
  const criticas = [tarjeta.estado, efectivo.estado].filter(
    (e) => e === 'diferencia' || e === 'sin_voucher'
  ).length;
  const pendientes = [tarjeta.estado, efectivo.estado].filter(
    (e) => e === 'pendiente_captura' || e === 'pendiente_cierre'
  ).length;

  let bannerSimbolo: string;
  let bannerTexto: string;
  if (criticas > 0) {
    bannerSimbolo = '⚠';
    bannerTexto = `${criticas} alerta${criticas > 1 ? 's' : ''} crítica${criticas > 1 ? 's' : ''}${
      pendientes > 0 ? ` · ${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : ''
    }`;
  } else if (pendientes > 0) {
    bannerSimbolo = '•';
    bannerTexto = `${pendientes} pendiente${pendientes > 1 ? 's' : ''} de captura`;
  } else {
    bannerSimbolo = '✓';
    bannerTexto = 'Corte cuadra';
  }

  const totalVouchers = vouchersTarjeta.reduce((s, v) => s + (v.monto_reportado ?? 0), 0);

  return (
    <div className="text-[10px]" style={{ pageBreakInside: 'avoid' }}>
      <div className="mb-1 border-y border-gray-400 py-0.5 font-semibold">
        {bannerSimbolo} {bannerTexto}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-gray-500">
            <th className="text-left">Método</th>
            <th className="text-right">Pedidos</th>
            <th className="text-right">Evidencia</th>
            <th className="w-8 text-center">Est.</th>
            <th className="text-right">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-300">
            <td>Tarjeta</td>
            <td className="text-right tabular-nums">{formatCurrency(tarjeta.ingresos_pedidos)}</td>
            <td className="text-right tabular-nums">
              {formatCurrency(tarjeta.total_evidencia)}
              {tarjeta.evidencia_pendiente > 0 ? ` (+${tarjeta.evidencia_pendiente} s/cap)` : ''}
            </td>
            <td className="text-center font-bold" title={ETIQUETA[tarjeta.estado]}>
              {SIMBOLO[tarjeta.estado]}
            </td>
            <td className="text-right tabular-nums">
              {tarjeta.evidencia_pendiente > 0
                ? '—'
                : tarjeta.diferencia === 0
                  ? '$0.00'
                  : (tarjeta.diferencia > 0 ? '+' : '') + formatCurrency(tarjeta.diferencia)}
            </td>
          </tr>
          <tr className="border-t border-gray-300">
            <td>Efectivo</td>
            <td className="text-right tabular-nums">{formatCurrency(efectivo.esperado)}</td>
            <td className="text-right tabular-nums">
              {efectivo.contado == null ? '—' : formatCurrency(efectivo.contado)}
            </td>
            <td className="text-center font-bold" title={ETIQUETA[efectivo.estado]}>
              {SIMBOLO[efectivo.estado]}
            </td>
            <td className="text-right tabular-nums">
              {efectivo.diferencia == null
                ? '—'
                : efectivo.diferencia === 0
                  ? '$0.00'
                  : (efectivo.diferencia > 0 ? '+' : '') + formatCurrency(efectivo.diferencia)}
            </td>
          </tr>
          {ingresosStripe > 0 && (
            <tr className="border-t border-gray-300 text-gray-600">
              <td>Stripe</td>
              <td className="text-right tabular-nums">{formatCurrency(ingresosStripe)}</td>
              <td className="text-right text-gray-400">—</td>
              <td className="text-center text-gray-400">—</td>
              <td className="text-right text-[9px] text-gray-500">sin conciliar</td>
            </tr>
          )}
          {ingresosTransferencias > 0 && (
            <tr className="border-t border-gray-300 text-gray-600">
              <td>Transferencia</td>
              <td className="text-right tabular-nums">{formatCurrency(ingresosTransferencias)}</td>
              <td className="text-right text-gray-400">—</td>
              <td className="text-center text-gray-400">—</td>
              <td className="text-right text-[9px] text-gray-500">sin conciliar</td>
            </tr>
          )}
        </tbody>
      </table>

      {vouchersTarjeta.length > 0 && (
        <div className="mt-2" style={{ pageBreakInside: 'avoid' }}>
          <div className="mb-0.5 text-[9px] uppercase tracking-wide text-gray-500">
            Vouchers de tarjeta ({vouchersTarjeta.length})
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {vouchersTarjeta.map((v) => {
                const capturado = v.monto_reportado != null;
                const banco = bancoNombrePor(v.banco_id ?? null);
                return (
                  <tr key={v.id} className="border-t border-gray-300">
                    <td className="py-0.5">
                      {banco ?? '—'}
                      {v.afiliacion ? (
                        <span className="text-gray-500"> · afil {v.afiliacion}</span>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">
                      {capturado ? formatCurrency(v.monto_reportado) : '—'}
                    </td>
                    <td className="w-8 text-center font-bold">{capturado ? '✓' : '•'}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-gray-400 font-semibold">
                <td className="py-0.5">Total vouchers</td>
                <td className="text-right tabular-nums">{formatCurrency(totalVouchers)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
