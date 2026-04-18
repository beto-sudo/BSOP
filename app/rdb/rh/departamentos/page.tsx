'use client';

import { RequireAccess } from '@/components/require-access';
import { DepartamentosModule } from '@/components/rh/departamentos-module';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.departamentos">
      <DepartamentosModule
        empresaId={EMPRESA_ID}
        empresaSlug="rdb"
        title="Departamentos — Rincón del Bosque"
        showEmpleadosCount
      />
    </RequireAccess>
  );
}
