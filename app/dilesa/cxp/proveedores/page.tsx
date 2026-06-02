'use client';

/**
 * CxP · Proveedores (DILESA) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpProveedoresModule> (components/cxp/). Este page
 * solo gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @responsive desktop-only — reporte de CxP en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpProveedoresModule } from '@/components/cxp/cxp-proveedores-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpProveedoresPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cxp.proveedores">
      <CxpProveedoresModule empresaId={DILESA_EMPRESA_ID} />
    </RequireAccess>
  );
}
