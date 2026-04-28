'use client';

import { RequireAccess } from '@/components/require-access';
import { ProveedoresModule } from '@/components/proveedores/proveedores-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.proveedores">
      <ProveedoresModule
        empresaId={RDB_EMPRESA_ID}
        empresaSlug="rdb"
        logoPath="/brand/rdb/header-email.png"
        membreteAlt="Membrete Rincón del Bosque"
      />
    </RequireAccess>
  );
}
