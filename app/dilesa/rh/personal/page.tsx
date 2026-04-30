'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EmpleadosModule } from '@/components/rh/personal-module';

const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/**
 * @module Personal (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa">
      <DesktopOnlyNotice module="Personal" />
      <div className="hidden sm:block">
        <EmpleadosModule
          empresaId={EMPRESA_ID}
          empresaSlug="dilesa"
          title="Personal — DILESA"
          showNumeroEmpleadoColumn
          showEstadoColumn
          showDeptoFilter
        />
      </div>
    </RequireAccess>
  );
}
