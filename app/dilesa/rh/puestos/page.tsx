'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PuestosModule } from '@/components/rh/puestos-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/**
 * @module Puestos (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Puestos" />
      <div className="hidden sm:block">
        <PuestosModule
          empresaId={EMPRESA_ID}
          empresaSlug="dilesa"
          title="Puestos — DILESA"
          showSalaryColumn
          showEmpleadoCountColumn
          showDeptoFilter
        />
      </div>
    </RequireAccess>
  );
}
