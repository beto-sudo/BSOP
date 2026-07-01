'use client';

/**
 * @module Ventas · Reporte Unidades escriturables (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<UnidadesEscriturablesView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { UnidadesEscriturablesView } from '@/components/dilesa/reportes/unidades-escriturables-view';

export default function UnidadesEscriturablesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <UnidadesEscriturablesView />
      </Suspense>
    </RequireAccess>
  );
}
