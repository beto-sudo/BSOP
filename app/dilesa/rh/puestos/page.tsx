'use client';

import { RequireAccess } from '@/components/require-access';
import { PuestosModule } from '@/components/rh/puestos-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <PuestosModule
        empresaId={EMPRESA_ID}
        empresaSlug="dilesa"
        title="Puestos — DILESA"
        showSalaryColumn
        showEmpleadoCountColumn
        showDeptoFilter
      />
    </RequireAccess>
  );
}
