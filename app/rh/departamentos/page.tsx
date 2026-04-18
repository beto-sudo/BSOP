'use client';

import { RequireAccess } from '@/components/require-access';
import { DepartamentosModule } from '@/components/rh/departamentos-module';

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <DepartamentosModule
        scope="user-empresas"
        empresaSlug=""
        title="Departamentos"
        createVariant="dialog"
      />
    </RequireAccess>
  );
}
