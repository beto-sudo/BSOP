'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProveedoresModule } from '@/components/proveedores/proveedores-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proveedores (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proveedores">
      <DesktopOnlyNotice module="Proveedores" />
      <div className="hidden sm:block">
        <ProveedoresModule
          empresaId={DILESA_EMPRESA_ID}
          empresaSlug="dilesa"
          logoPath="/brand/dilesa/header-email.png"
          membreteAlt="Membrete DILESA"
        />
      </div>
    </RequireAccess>
  );
}
