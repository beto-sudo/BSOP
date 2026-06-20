'use client';

/**
 * @module Ventas · Reporte Escrituración programada (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<EscrituracionProgramadaView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { EscrituracionProgramadaView } from '@/components/dilesa/reportes/escrituracion-programada-view';

export default function EscrituracionProgramadaPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <EscrituracionProgramadaView />
      </Suspense>
    </RequireAccess>
  );
}
