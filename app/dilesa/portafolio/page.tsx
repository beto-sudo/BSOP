'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PortafolioModule } from '@/components/dilesa/portafolio-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Portafolio (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.portafolio">
      <DesktopOnlyNotice module="Portafolio" />
      <div className="hidden sm:block">
        <PortafolioModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
