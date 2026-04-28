'use client';

import { RequireAccess } from '@/components/require-access';
import { ProveedoresModule } from '@/components/proveedores/proveedores-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proveedores">
      <ProveedoresModule
        empresaId={DILESA_EMPRESA_ID}
        empresaSlug="dilesa"
        logoPath="/brand/dilesa/header-email.png"
        membreteAlt="Membrete DILESA"
      />
    </RequireAccess>
  );
}
