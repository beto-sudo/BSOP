'use client';

/**
 * CxP · Proveedores (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpProveedoresModule> (components/cxp/). Este page
 * solo gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @responsive desktop-only — reporte de CxP en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpProveedoresModule } from '@/components/cxp/cxp-proveedores-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpProveedoresPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.proveedores">
      <CxpProveedoresModule empresaId={RDB_EMPRESA_ID} />
    </RequireAccess>
  );
}
