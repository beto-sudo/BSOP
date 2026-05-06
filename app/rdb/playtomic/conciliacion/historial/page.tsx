'use client';

import { DesktopOnlyNotice } from '@/components/responsive';
import { HistorialView } from '@/components/playtomic/conciliacion/historial-view';

/**
 * @module Historial de conciliación Playtomic ↔ Waitry (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 */
export default function HistorialPage() {
  return (
    <>
      <DesktopOnlyNotice module="Historial Conciliación Playtomic" />
      <div className="hidden sm:block">
        <HistorialView />
      </div>
    </>
  );
}
