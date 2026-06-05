'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { OrdenesCompraModule } from '@/components/compras/ordenes-compra-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Compras · Órdenes (DILESA)
 * @responsive desktop-only
 *
 * Tab "Órdenes" (default landing) del hub Compras (iniciativa dilesa-compras ·
 * Sprint 2 Fase B). Órdenes de compra ancladas a concepto + partida; al
 * enviarse mueven `comprometido` en `erp.v_partida_control`. Reusa las RPCs de
 * OC de `erp`. Gate: sub-slug `dilesa.compras.ordenes` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.ordenes">
      <DesktopOnlyNotice module="Órdenes de compra" />
      <div className="hidden sm:block">
        <OrdenesCompraModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
