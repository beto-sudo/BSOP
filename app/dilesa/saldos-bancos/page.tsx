'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { SaldosBancosModule } from '@/components/dilesa/saldos-bancos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Saldos Bancos (DILESA)
 * @responsive desktop-only
 *
 * Captura manual de saldos bancarios DILESA con historial (iniciativa
 * `tesoreria`, Sprint 3). Una fila por cuenta activa con su último saldo,
 * fecha y antigüedad; captura por cuenta apila un snapshot en
 * `erp.cuenta_saldos`. Fuente de verdad del bloque #1 ("Saldos Bancos") del
 * correo diario al Consejo (`dilesa-resumen-consejo`).
 *
 * Gate: `dilesa.saldos-bancos` (RBAC liberado en Sprint 2). El módulo no usa
 * `useSearchParams`, así que no requiere Suspense boundary (Next.js 16).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.saldos-bancos">
      <DesktopOnlyNotice module="Saldos Bancos" />
      <div className="hidden sm:block">
        <SaldosBancosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
