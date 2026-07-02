'use client';

import { RequireAccess } from '@/components/require-access';
import { PosKdsModule } from '@/components/pos/kds-module';

export default function PosKdsPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.pos.kds">
      <PosKdsModule />
    </RequireAccess>
  );
}
