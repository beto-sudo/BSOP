'use client';

import { RequireAccess } from '@/components/require-access';
import { PuestosModule } from '@/components/rh/puestos-module';

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <PuestosModule
        scope="user-empresas"
        empresaSlug=""
        title="Puestos"
        createVariant="dialog"
      />
    </RequireAccess>
  );
}
