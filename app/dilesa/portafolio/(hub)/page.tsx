'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PortafolioModule } from '@/components/dilesa/portafolio-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Portafolio · Inventario (DILESA)
 * @responsive desktop-only
 *
 * Tab "Inventario" del hub Portafolio (ADR-030). Sub-slug
 * `dilesa.portafolio.inventario`. El layout monta los tabs.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.portafolio.inventario">
      <DesktopOnlyNotice module="Portafolio" />
      <div className="hidden sm:block">
        <PortafolioModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
