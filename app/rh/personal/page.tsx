'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EmpleadosModule } from '@/components/rh/personal-module';

/**
 * @module Personal (cross-empresa)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess adminOnly>
      <DesktopOnlyNotice module="Personal" />
      <div className="hidden sm:block">
        <EmpleadosModule
          scope="user-empresas"
          empresaSlug=""
          title="Personal"
          createVariant="dialog"
        />
      </div>
    </RequireAccess>
  );
}
