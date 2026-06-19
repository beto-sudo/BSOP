'use client';

/**
 * @module Ventas · Reporte Pipeline por fase (DILESA)
 * @responsive desktop-only
 *
 * Reporte golden del patrón ADR-047 (preset + vista + PDF). El cuerpo usa
 * `useUrlFilters` (useSearchParams) → se separa en `<PipelinePorFaseView>`
 * envuelto en Suspense para evitar el bailout de CSR de Next 16. La página es
 * `'use client'` (como `app/dilesa/ventas/fases/page.tsx`): una página RSC con
 * `useSearchParams` en el subárbol cliente rompe el prerender estático.
 *
 * Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { PipelinePorFaseView } from '@/components/dilesa/reportes/pipeline-por-fase-view';

export default function PipelinePorFasePage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <PipelinePorFaseView />
      </Suspense>
    </RequireAccess>
  );
}
