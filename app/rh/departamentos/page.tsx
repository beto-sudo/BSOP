'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DepartamentosModule } from '@/components/rh/departamentos-module';

/**
 * @module Departamentos (cross-empresa)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess adminOnly>
      <DesktopOnlyNotice module="Departamentos" />
      <div className="hidden sm:block">
        <DepartamentosModule
          scope="user-empresas"
          empresaSlug=""
          title="Departamentos"
          createVariant="dialog"
        />
      </div>
    </RequireAccess>
  );
}
