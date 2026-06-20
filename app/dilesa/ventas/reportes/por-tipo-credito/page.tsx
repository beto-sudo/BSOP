'use client';

/**
 * @module Ventas · Reporte Por tipo de crédito (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<PorTipoCreditoView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { PorTipoCreditoView } from '@/components/dilesa/reportes/por-tipo-credito-view';

export default function PorTipoCreditoPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <PorTipoCreditoView />
      </Suspense>
    </RequireAccess>
  );
}
