'use client';

/**
 * @module Ventas · Reporte Depósitos del periodo (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047 (preset + vista + PDF + CSV). `'use client'` (como
 * `ventas-periodo/page.tsx`): el cuerpo usa `useUrlFilters` (useSearchParams),
 * separado en `<DetonacionesView>` bajo Suspense. (Los archivos de la vista/lib
 * conservan el nombre interno `detonaciones`: el dato núcleo sigue siendo el
 * abono de institución = la detonación; aquí solo cambió la etiqueta de cara
 * al usuario a «Depósitos del periodo».)
 *
 * Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { DetonacionesView } from '@/components/dilesa/reportes/detonaciones-view';

export default function DetonacionesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <DetonacionesView />
      </Suspense>
    </RequireAccess>
  );
}
