'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { VentasModule } from '@/components/dilesa/ventas-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Ventas (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas">
      <DesktopOnlyNotice module="Ventas" />
      <div className="hidden sm:block">
        <VentasModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
