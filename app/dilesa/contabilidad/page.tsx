'use client';

import { ContabilidadCatalogoModule } from '@/components/dilesa/contabilidad-catalogo-module';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Contabilidad — Catálogo de cuentas (DILESA)
 * @responsive desktop-only
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.contabilidad">
      <DesktopOnlyNotice module="Contabilidad" />
      <div className="hidden sm:block">
        <ContabilidadCatalogoModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
