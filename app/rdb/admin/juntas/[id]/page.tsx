'use client';

import { RequireAccess } from '@/components/require-access';
import { JuntaDetailModule } from '@/components/juntas/junta-detail-module';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.admin.juntas">
      <JuntaDetailModule empresaSlug="rdb" />
    </RequireAccess>
  );
}
