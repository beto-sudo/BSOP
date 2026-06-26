'use client';

/**
 * CxP · Pagos (DILESA) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Pipeline S2: última etapa, los pagos **ya ejecutados** (histórico). Reusa
 * <CxpPagosModule> con estado inicial 'pagado'. La ejecución (marcar pagado +
 * comprobante) vive en la pestaña "Programación".
 *
 * @module CxP — Pagos (DILESA)
 * @responsive desktop-only — consulta administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpPagosModule } from '@/components/cxp/cxp-pagos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpPagosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cxp.pagos">
      <CxpPagosModule empresaId={DILESA_EMPRESA_ID} empresa="dilesa" estadoInicial="pagado" />
    </RequireAccess>
  );
}
