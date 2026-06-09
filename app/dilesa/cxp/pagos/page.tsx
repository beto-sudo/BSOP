'use client';

/**
 * CxP · Pagos (DILESA) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpPagosModule> (components/cxp/). Este page solo
 * gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @module CxP — Pagos (DILESA)
 * @responsive desktop-only — aprobación/pago administrativo en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpPagosModule } from '@/components/cxp/cxp-pagos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpPagosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cxp.pagos">
      <CxpPagosModule empresaId={DILESA_EMPRESA_ID} empresa="dilesa" />
    </RequireAccess>
  );
}
