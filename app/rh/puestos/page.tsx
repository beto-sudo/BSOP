'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PuestosModule } from '@/components/rh/puestos-module';

/**
 * @module Puestos (cross-empresa)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess adminOnly>
      <DesktopOnlyNotice module="Puestos" />
      <div className="hidden sm:block">
        <PuestosModule
          scope="user-empresas"
          empresaSlug=""
          title="Puestos"
          createVariant="dialog"
        />
      </div>
    </RequireAccess>
  );
}
