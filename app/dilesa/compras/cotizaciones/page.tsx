'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { CotizacionesModule } from '@/components/compras/cotizaciones-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Compras · Cotizaciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Cotizaciones" del hub Compras (iniciativa dilesa-compras · Sprint
 * Cotizaciones). RFQ formal multi-proveedor: se pide precio a N proveedores
 * por las líneas (ancladas a partida), se captura la matriz precio×proveedor,
 * y en Fase 3 se compara y adjudica a OC (materiales) o contrato (obra).
 * Gate: sub-slug `dilesa.compras.cotizaciones` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.cotizaciones">
      <DesktopOnlyNotice module="Cotizaciones" />
      <div className="hidden sm:block">
        <CotizacionesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
