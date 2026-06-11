'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { SaldosBancosModule } from '@/components/dilesa/saldos-bancos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Saldos Bancos · Saldos (DILESA)
 * @responsive desktop-only
 *
 * Captura manual de saldos bancarios DILESA con historial (iniciativa
 * `tesoreria`, Sprint 3). Una fila por cuenta activa con su último saldo,
 * fecha, antigüedad y ficha completa; captura por cuenta apila un snapshot
 * en `erp.cuenta_saldos`. Fuente de verdad del bloque #1 ("Saldos Bancos")
 * del correo diario al Consejo (`dilesa-resumen-consejo`).
 *
 * Tab default del módulo (ADR-030, iniciativa `conciliacion-bancaria` v0).
 * Gate: `dilesa.saldos-bancos.saldos`. El módulo no usa `useSearchParams`,
 * así que no requiere Suspense boundary (Next.js 16).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.saldos-bancos.saldos">
      <DesktopOnlyNotice module="Bancos" />
      <div className="hidden sm:block">
        <SaldosBancosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
