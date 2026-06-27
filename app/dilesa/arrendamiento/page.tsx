'use client';

import { ArrendamientoModule } from '@/components/dilesa/arrendamiento-module';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Arrendamiento (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.arrendamiento">
      <DesktopOnlyNotice module="Arrendamiento" />
      <div className="hidden sm:block">
        <ArrendamientoModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
