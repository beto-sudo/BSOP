'use client';

import { RequireAccess } from '@/components/require-access';
import { PuestosModule } from '@/components/rh/puestos-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

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
