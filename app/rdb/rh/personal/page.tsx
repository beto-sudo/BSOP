'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EmpleadosModule } from '@/components/rh/personal-module';

const EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

/**
 * @module Personal (RDB)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.empleados">
      <DesktopOnlyNotice module="Personal" />
      <div className="hidden sm:block">
        <EmpleadosModule
          empresaId={EMPRESA_ID}
          empresaSlug="rdb"
          title="Personal — Rincón del Bosque"
        />
      </div>
    </RequireAccess>
  );
}
