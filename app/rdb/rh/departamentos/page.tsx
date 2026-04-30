'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DepartamentosModule } from '@/components/rh/departamentos-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

/**
 * @module Departamentos (RDB)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.departamentos">
      <DesktopOnlyNotice module="Departamentos" />
      <div className="hidden sm:block">
        <DepartamentosModule
          empresaId={EMPRESA_ID}
          empresaSlug="rdb"
          title="Departamentos — Rincón del Bosque"
          showEmpleadosCount
        />
      </div>
    </RequireAccess>
  );
}
