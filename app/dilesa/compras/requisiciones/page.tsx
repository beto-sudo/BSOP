'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { RequisicionesModule } from '@/components/compras/requisiciones-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Compras · Requisiciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Requisiciones" del hub Compras (iniciativa dilesa-compras · Sprint 2
 * Fase D). Solicitudes de compra previas a la orden, ancladas a concepto +
 * partida; de cada una se genera la OC con un clic heredando la partida (mueve
 * `comprometido`). Gate: sub-slug `dilesa.compras.requisiciones` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.requisiciones">
      <DesktopOnlyNotice module="Requisiciones" />
      <div className="hidden sm:block">
        <RequisicionesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
