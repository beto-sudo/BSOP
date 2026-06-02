'use client';

/**
 * CxP · Saldos (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpAgingModule> (components/cxp/). Este page solo
 * gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @responsive desktop-only — reporte de CxP en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpAgingModule } from '@/components/cxp/cxp-aging-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpAgingPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.aging">
      <CxpAgingModule empresaId={RDB_EMPRESA_ID} />
    </RequireAccess>
  );
}
