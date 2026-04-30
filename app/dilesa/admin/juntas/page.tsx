'use client';

import { RequireAccess } from '@/components/require-access';
import { AdminJuntasListModule } from '@/components/juntas/admin-juntas-list-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Juntas (DILESA)
 * @responsive responsive
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <AdminJuntasListModule
        empresaId={DILESA_EMPRESA_ID}
        empresaSlug="dilesa"
        title="Juntas — DILESA"
      />
    </RequireAccess>
  );
}
