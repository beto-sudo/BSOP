'use client';

import { RequireAccess } from '@/components/require-access';
import { JuntaDetailModule } from '@/components/juntas/junta-detail-module';

/**
 * @module Junta detail (RDB)
 * @responsive responsive
 */
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.admin.juntas">
      <JuntaDetailModule empresaSlug="rdb" />
    </RequireAccess>
  );
}
