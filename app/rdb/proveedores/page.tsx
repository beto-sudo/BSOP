'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProveedoresModule } from '@/components/proveedores/proveedores-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proveedores (RDB)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.proveedores">
      <DesktopOnlyNotice module="Proveedores" />
      <div className="hidden sm:block">
        <ProveedoresModule
          empresaId={RDB_EMPRESA_ID}
          empresaSlug="rdb"
          logoPath="/brand/rdb/header-email.png"
          membreteAlt="Membrete Rincón del Bosque"
        />
      </div>
    </RequireAccess>
  );
}
