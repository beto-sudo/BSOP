'use client';

/**
 * CxP · Pagos (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpPagosModule> (components/cxp/). Este page solo
 * gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @module CxP — Pagos (RDB)
 * @responsive desktop-only — aprobación/pago administrativo en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpPagosModule } from '@/components/cxp/cxp-pagos-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpPagosPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.pagos">
      <CxpPagosModule empresaId={RDB_EMPRESA_ID} empresa="rdb" />
    </RequireAccess>
  );
}
