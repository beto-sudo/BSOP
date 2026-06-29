'use client';

/**
 * @module Ventas · Reporte Calificación por fase (DILESA)
 * @responsive desktop-only
 *
 * Radar de cuellos del pipeline (iniciativa dilesa-fluidez-pipeline, S2a). El
 * cuerpo usa `useUrlFilters` (useSearchParams) → se separa en
 * `<CalificacionPorFaseView>` envuelto en Suspense para evitar el bailout de CSR
 * de Next 16. Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { CalificacionPorFaseView } from '@/components/dilesa/reportes/calificacion-por-fase-view';

export default function CalificacionPorFasePage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <CalificacionPorFaseView />
      </Suspense>
    </RequireAccess>
  );
}
