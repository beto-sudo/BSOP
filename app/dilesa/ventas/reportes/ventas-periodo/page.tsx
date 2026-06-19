'use client';

/**
 * @module Ventas · Reporte Ventas del periodo (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047 (preset + vista + PDF). `'use client'` (como `fases/page.tsx`):
 * el cuerpo usa `useUrlFilters` (useSearchParams), separado en `<VentasPeriodoView>`
 * bajo Suspense.
 *
 * Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { VentasPeriodoView } from '@/components/dilesa/reportes/ventas-periodo-view';

export default function VentasPeriodoPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <VentasPeriodoView />
      </Suspense>
    </RequireAccess>
  );
}
