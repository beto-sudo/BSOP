'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PredialesModule } from '@/components/dilesa/prediales-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Portafolio · Prediales (DILESA)
 * @responsive desktop-only
 *
 * Tab "Prediales" del hub Portafolio (ADR-030, iniciativa
 * `dilesa-portafolio-predios` · S3). Sub-slug `dilesa.portafolio.prediales`.
 * Control anual del impuesto predial por cuenta catastral.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.portafolio.prediales">
      <DesktopOnlyNotice module="Portafolio" />
      <div className="hidden sm:block">
        <PredialesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
