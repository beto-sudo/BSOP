'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ComprasProximamente } from '@/components/compras/compras-proximamente';

/**
 * @module Compras · Requisiciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Requisiciones" del hub Compras (iniciativa dilesa-compras · Sprint 2).
 * Solicitudes de compra previas a la orden, ancladas a concepto + partida.
 * Gate: sub-slug `dilesa.compras.requisiciones` (ADR-030 SS5).
 *
 * Placeholder de Fase A — la captura llega en Fase D (después de OC y Recepción).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.requisiciones">
      <DesktopOnlyNotice module="Requisiciones" />
      <div className="hidden sm:block">
        <ComprasProximamente
          titulo="Requisiciones"
          descripcion="Solicitudes de compra previas a la orden, ancladas a concepto + partida del presupuesto. Llega en la Fase D del Sprint 2."
        />
      </div>
    </RequireAccess>
  );
}
