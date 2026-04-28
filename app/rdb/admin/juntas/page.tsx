'use client';

import { RequireAccess } from '@/components/require-access';
import { AdminJuntasListModule } from '@/components/juntas/admin-juntas-list-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.admin.juntas">
      <AdminJuntasListModule
        empresaId={RDB_EMPRESA_ID}
        empresaSlug="rdb"
        title="Juntas — Rincón del Bosque"
      />
    </RequireAccess>
  );
}
