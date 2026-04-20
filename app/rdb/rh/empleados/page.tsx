'use client';

import { RequireAccess } from '@/components/require-access';
import { EmpleadosModule } from '@/components/rh/empleados-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.empleados">
      <EmpleadosModule
        empresaId={EMPRESA_ID}
        empresaSlug="rdb"
        title="Empleados — Rincón del Bosque"
      />
    </RequireAccess>
  );
}
