'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ConciliacionView } from '@/components/playtomic/conciliacion/conciliacion-view';

/**
 * @module Conciliación Playtomic ↔ Waitry (RDB)
 * @responsive desktop-only
 */
export default function ConciliacionPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
      <DesktopOnlyNotice module="Conciliación Playtomic" />
      <div className="hidden sm:block">
        <ConciliacionView />
      </div>
    </RequireAccess>
  );
}
