'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { VentasModule } from '@/components/dilesa/ventas-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Ventas · Lista (DILESA)
 * @responsive desktop-only
 *
 * Default landing del hub Ventas (sprint tabs-hub). Lista filtrable de las
 * ventas DILESA con comprador (cross-schema `erp.personas`), proyecto/unidad,
 * fase actual, precio y vendedor. Click en una fila navega a
 * `/dilesa/ventas/[id]` con la ficha completa, pipeline (de `venta_fases`),
 * pagos y expediente digital.
 *
 * Gate: sub-slug `dilesa.ventas.lista` (ADR-030 SS5). El padre
 * `dilesa.ventas` queda como umbrella; el sub-slug gobierna el contenido
 * real de esta tab.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.lista">
      <DesktopOnlyNotice module="Ventas" />
      <div className="hidden sm:block">
        <VentasModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
