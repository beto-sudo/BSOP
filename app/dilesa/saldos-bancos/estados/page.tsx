'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EstadosCuentaModule } from '@/components/dilesa/estados-cuenta-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Saldos Bancos · Estados de cuenta (DILESA)
 * @responsive desktop-only
 *
 * Archivo mensual de estados de cuenta bancarios con conciliación a nivel
 * mes (iniciativa `conciliacion-bancaria` v0): subes el PDF, la IA extrae la
 * carátula, confirmas, y la fila queda con sus 3 checks (checksum,
 * continuidad, cruce vs captura). Tab del módulo Saldos Bancos (ADR-030).
 *
 * Gate: `dilesa.saldos-bancos.estados`. Sin `useSearchParams` — no requiere
 * Suspense boundary (Next.js 16).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.saldos-bancos.estados">
      <DesktopOnlyNotice module="Estados de cuenta" />
      <div className="hidden sm:block">
        <EstadosCuentaModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
