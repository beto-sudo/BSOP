'use client';

import { RequireAccess } from '@/components/require-access';
import { PosAdminModule } from '@/components/pos/admin-module';

export default function PosAdminPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.pos.admin">
      <PosAdminModule />
    </RequireAccess>
  );
}
