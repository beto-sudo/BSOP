'use client';

import { DesktopOnlyNotice } from '@/components/responsive';
import { ConciliacionView } from '@/components/playtomic/conciliacion/conciliacion-view';

/**
 * @module Conciliación Playtomic ↔ Waitry (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 */
export default function ConciliacionPage() {
  return (
    <>
      <DesktopOnlyNotice module="Conciliación Playtomic" />
      <div className="hidden sm:block">
        <ConciliacionView />
      </div>
    </>
  );
}
