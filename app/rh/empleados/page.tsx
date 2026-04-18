'use client';

import { RequireAccess } from '@/components/require-access';
import { EmpleadosModule } from '@/components/rh/empleados-module';

export default function Page() {
  return (
    <RequireAccess adminOnly>
      <EmpleadosModule
        scope="user-empresas"
        empresaSlug=""
        title="Empleados"
        createVariant="dialog"
      />
    </RequireAccess>
  );
}
