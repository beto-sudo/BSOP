'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DepartamentosModule } from '@/components/rh/departamentos-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/**
 * @module Departamentos (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Departamentos" />
      <div className="hidden sm:block">
        <DepartamentosModule
          empresaId={EMPRESA_ID}
          empresaSlug="dilesa"
          title="Departamentos — DILESA"
          showEmpleadosCount
        />
      </div>
    </RequireAccess>
  );
}
