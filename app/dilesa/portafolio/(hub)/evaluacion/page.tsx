'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EvaluacionModule } from '@/components/dilesa/evaluacion-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Portafolio · Evaluación de compra (DILESA)
 * @responsive desktop-only
 *
 * Tab "Evaluación" del hub Portafolio (ADR-030). Sub-slug
 * `dilesa.portafolio.evaluacion`. Lista los activos en evaluación de compra
 * (estado `prospecto`) — el pipeline de adquisición de terrenos.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.portafolio.evaluacion">
      <DesktopOnlyNotice module="Portafolio" />
      <div className="hidden sm:block">
        <EvaluacionModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
