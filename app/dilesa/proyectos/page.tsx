'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProyectosModule } from '@/components/dilesa/proyectos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proyectos (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos">
      <DesktopOnlyNotice module="Proyectos" />
      <div className="hidden sm:block">
        <ProyectosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
