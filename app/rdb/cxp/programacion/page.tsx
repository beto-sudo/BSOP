'use client';

/**
 * CxP · Programación (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Toda la lógica vive en <CxpProgramacionModule> (components/cxp/). Este page
 * solo gatea con <RequireAccess> y pasa la identidad de la empresa. Se separa
 * el cuerpo del gate porque el módulo usa useSearchParams (vía useUrlFilters):
 * <RequireAccess> retorna null mientras carga y provee el boundary de Suspense.
 *
 * @module CxP — Programación (RDB)
 * @responsive desktop-only — programación administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpProgramacionModule } from '@/components/cxp/cxp-programacion-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpProgramacionPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.programacion">
      <CxpProgramacionModule empresaId={RDB_EMPRESA_ID} empresa="rdb" />
    </RequireAccess>
  );
}
