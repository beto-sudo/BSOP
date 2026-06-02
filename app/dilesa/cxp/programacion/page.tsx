'use client';

/**
 * CxP · Programación (DILESA) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpProgramacionModule> (components/cxp/). Este page
 * solo gatea con <RequireAccess> y pasa la identidad de la empresa. Se separa
 * el cuerpo del gate porque el módulo usa useSearchParams (vía useUrlFilters):
 * <RequireAccess> retorna null mientras carga y provee el boundary de Suspense.
 *
 * @module CxP — Programación (DILESA)
 * @responsive desktop-only — programación administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpProgramacionModule } from '@/components/cxp/cxp-programacion-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpProgramacionPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cxp.programacion">
      <CxpProgramacionModule empresaId={DILESA_EMPRESA_ID} empresa="dilesa" />
    </RequireAccess>
  );
}
