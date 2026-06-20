'use client';

/**
 * @module Ventas · Reporte Ventas estancadas (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<EstancadasView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { EstancadasView } from '@/components/dilesa/reportes/estancadas-view';

export default function EstancadasPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <EstancadasView />
      </Suspense>
    </RequireAccess>
  );
}
