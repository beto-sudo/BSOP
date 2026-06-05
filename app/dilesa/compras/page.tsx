'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ComprasProximamente } from '@/components/compras/compras-proximamente';

/**
 * @module Compras · Órdenes (DILESA)
 * @responsive desktop-only
 *
 * Tab "Órdenes" (default landing) del hub Compras (iniciativa dilesa-compras ·
 * Sprint 2). Órdenes de compra ancladas a concepto + partida; al enviarse
 * mueven `comprometido` en `erp.v_partida_control`. Reusa las RPCs de OC de
 * `erp` (`oc_cerrar_orden`, `oc_cancelar_pendiente_linea`,
 * `fn_oc_recalcular_estado`). Gate: sub-slug `dilesa.compras.ordenes`
 * (ADR-030 SS5).
 *
 * Placeholder de Fase A — el módulo de OC funcional llega en Fase B (tras
 * aplicar la migración de sub-slugs y validar la estructura).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.ordenes">
      <DesktopOnlyNotice module="Órdenes de compra" />
      <div className="hidden sm:block">
        <ComprasProximamente
          titulo="Órdenes de compra"
          descripcion="Órdenes ancladas a concepto + partida del presupuesto; al enviarse comprometen el presupuesto de la partida. Llega en la Fase B del Sprint 2."
        />
      </div>
    </RequireAccess>
  );
}
