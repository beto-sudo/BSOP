'use client';

import { Suspense } from 'react';
import { DesktopOnlyNotice } from '@/components/responsive';
import { Skeleton } from '@/components/ui/skeleton';
import { ConciliacionView } from '@/components/playtomic/conciliacion/conciliacion-view';

/**
 * @module Conciliación Playtomic ↔ Waitry (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 *
 * `<Suspense>` boundary: requerido por `useSearchParams()` que usa el view
 * para leer `?selected=<bookingId>` (deep-link desde el tab Historial).
 * Sin esto, Next.js bail-out de static rendering con un warning.
 */
export default function ConciliacionPage() {
  return (
    <>
      <DesktopOnlyNotice module="Conciliación Playtomic" />
      <div className="hidden sm:block">
        <Suspense
          fallback={
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-96 w-full" />
            </div>
          }
        >
          <ConciliacionView />
        </Suspense>
      </div>
    </>
  );
}
