'use client';

/**
 * CxP · Pagos (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Pipeline S2: última etapa, los pagos **ya ejecutados** (histórico). Reusa
 * <CxpPagosModule> con estado inicial 'pagado'. La ejecución (marcar pagado +
 * comprobante) vive en la pestaña "Programación".
 *
 * @module CxP — Pagos (RDB)
 * @responsive desktop-only — consulta administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpPagosModule } from '@/components/cxp/cxp-pagos-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpPagosPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.pagos">
      <CxpPagosModule empresaId={RDB_EMPRESA_ID} empresa="rdb" estadoInicial="pagado" />
    </RequireAccess>
  );
}
