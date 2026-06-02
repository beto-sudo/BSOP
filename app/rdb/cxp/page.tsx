'use client';

/**
 * CxP · Facturas (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpFacturasModule> (components/cxp/). Este page
 * solo gatea con <RequireAccess> y pasa la identidad de la empresa.
 *
 * @module CxP — Facturas (RDB)
 * @responsive desktop-only — reportería/captura administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpFacturasModule } from '@/components/cxp/cxp-facturas-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpFacturasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.facturas">
      <CxpFacturasModule empresaId={RDB_EMPRESA_ID} empresa="rdb" />
    </RequireAccess>
  );
}
