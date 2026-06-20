'use client';

/**
 * @module Ventas · Reporte Ventas desasignadas (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<DesasignadasView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { DesasignadasView } from '@/components/dilesa/reportes/desasignadas-view';

export default function DesasignadasPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <DesasignadasView />
      </Suspense>
    </RequireAccess>
  );
}
