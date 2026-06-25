'use client';

/**
 * Tab "Cuadratura" del expediente de venta DILESA. Ajustes de buckets de
 * descuento (solo Dirección) + panel de cuadratura de la operación. Consume el
 * `VentaDetalleProvider` montado por el layout `[id]/layout.tsx`.
 *
 * @module Venta · Cuadratura (DILESA)
 * @responsive desktop-only
 */

import { RequireAccess } from '@/components/require-access';
import { CuadraturaAjustes } from '@/components/dilesa/cuadratura-ajustes';
import { CuadraturaPanel } from '@/components/dilesa/cuadratura-panel';
import { useVentaDetalle } from '@/components/dilesa/venta-detalle/provider';

export default function VentaCuadraturaPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.cuadratura">
      <CuadraturaBody />
    </RequireAccess>
  );
}

function CuadraturaBody() {
  const {
    venta,
    cuadInputs,
    setCuadInputs,
    apoyoInfonavit,
    promo,
    cuadratura,
    hayFacturaCfdi,
    effectiveUser,
  } = useVentaDetalle();
  if (!venta) return null;

  return (
    <div className="space-y-5">
      <CuadraturaAjustes
        ventaId={venta.id}
        values={cuadInputs}
        onPatch={(patch) => setCuadInputs((prev) => ({ ...prev, ...patch }))}
        apoyoInfonavit={apoyoInfonavit}
        tipoCredito={venta.tipo_credito}
        tieneDesglose={cuadratura.tieneDesglose}
        descuentoPromocion={cuadratura.coberturaGastos?.promocion ?? 0}
        descuentoReal={cuadratura.descuentoReal}
        sobreprecioCapturado={cuadratura.coberturaGastos?.sobreprecio ?? 0}
        descuentoMaximo={promo ? promo.monto : Number(venta.descuento_maximo_autorizado ?? 0)}
        descuentoMaximoFuente={
          promo ? promo.nombre : venta.descuento_maximo_autorizado != null ? 'legacy Coda' : null
        }
        canWrite={
          // Buckets de descuento: solo Dirección (regla Beto 2026-06-15) — admin
          // global O rol Dirección en la empresa de la venta.
          !!effectiveUser?.isAdmin ||
          (effectiveUser?.direccionEmpresaIds ?? []).includes(venta.empresa_id)
        }
      />
      <CuadraturaPanel
        cuadratura={cuadratura}
        valorEscrituracion={venta.valor_escrituracion}
        chequeCapturado={venta.monto_cheque_notaria != null}
        hayFacturaCfdi={hayFacturaCfdi}
        saldoResidual={{
          resolucion: venta.saldo_residual_resolucion,
          monto: venta.saldo_residual_monto,
        }}
      />
    </div>
  );
}
