'use client';

/**
 * @module Ventas · Reporte Inventario disponible (DILESA)
 * @responsive desktop-only
 *
 * Patrón ADR-047. `'use client'` (useUrlFilters en el subárbol), cuerpo en
 * `<InventarioDisponibleView>` bajo Suspense. Gate: `dilesa.ventas.reportes` (SS5).
 */
import { Suspense } from 'react';
import { RequireAccess } from '@/components/require-access';
import { Skeleton } from '@/components/ui/skeleton';
import { InventarioDisponibleView } from '@/components/dilesa/reportes/inventario-disponible-view';

export default function InventarioDisponiblePage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <Suspense
        fallback={
          <div className="p-6">
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        }
      >
        <InventarioDisponibleView />
      </Suspense>
    </RequireAccess>
  );
}
