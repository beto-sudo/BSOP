'use client';

import { RequireAccess } from '@/components/require-access';
import { PosCapturaModule } from '@/components/pos/captura-module';

export default function PosCapturaPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.pos.captura">
      <PosCapturaModule />
    </RequireAccess>
  );
}
