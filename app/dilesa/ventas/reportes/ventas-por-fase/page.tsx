'use client';

/**
 * @module Ventas · Reporte Ventas por fase (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047 (preset + vista + PDF + CSV). `'use client'` (como
 * `ventas-periodo/page.tsx`): el cuerpo usa `useUrlFilters` (useSearchParams),
 * separado en `<VentasPorFaseView>` bajo Suspense.
 *
 * Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { VentasPorFaseView } from '@/components/dilesa/reportes/ventas-por-fase-view';

export default function VentasPorFasePage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <VentasPorFaseView />
      </Suspense>
    </RequireAccess>
  );
}
