'use client';

/**
 * CxP · Programación (RDB) — wrapper delgado del módulo compartido (ADR-011, SM1).
 *
 * Pipeline S2: esta pestaña muestra los pagos **por ejecutar**
 * (programado/aprobado) y permite marcar pagado + subir comprobante; al pagarse
 * pasan solos a la pestaña "Pagos". Reusa <CxpPagosModule> con estado inicial
 * 'pendientes'. (Programar el pago ahora vive en la pestaña Facturas — S1.)
 *
 * @module CxP — Programación (RDB)
 * @responsive desktop-only — ejecución de pagos administrativa en escritorio.
 */

import { RequireAccess } from '@/components/require-access';
import { CxpPagosModule } from '@/components/cxp/cxp-pagos-module';
import { RDB_EMPRESA_ID } from '@/lib/empresa-constants';

export default function CxpProgramacionPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.programacion">
      <CxpPagosModule empresaId={RDB_EMPRESA_ID} empresa="rdb" estadoInicial="pendientes" />
    </RequireAccess>
  );
}
