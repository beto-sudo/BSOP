'use client';

import { RequireAccess } from '@/components/require-access';
import { EmpleadosModule } from '@/components/rh/empleados-module';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

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
