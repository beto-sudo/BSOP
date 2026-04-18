'use client';

import { RequireAccess } from '@/components/require-access';
import { PuestosModule } from '@/components/rh/puestos-module';

const EMPRESA_ID = '41c0b58f-5483-439b-aaa6-17b9d995697f';

export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.puestos">
      <PuestosModule
        empresaId={EMPRESA_ID}
        empresaSlug="rdb"
        title="Puestos — Rincón del Bosque"
        showSalaryColumn
        showEmpleadoCountColumn
      />
    </RequireAccess>
  );
}
