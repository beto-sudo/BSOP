'use client';

import { RequireAccess } from '@/components/require-access';
import { JuntaDetailModule } from '@/components/juntas/junta-detail-module';

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <JuntaDetailModule empresaSlug="dilesa" />
    </RequireAccess>
  );
}
