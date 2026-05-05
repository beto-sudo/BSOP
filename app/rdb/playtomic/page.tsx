'use client';

import { DesktopOnlyNotice } from '@/components/responsive';
import { PlaytomicView } from '@/components/playtomic/playtomic-view';

/**
 * @module Playtomic — Dashboard (RDB)
 * @responsive desktop-only
 *
 * Gate de acceso + tabs compartidos viven en `app/rdb/playtomic/layout.tsx`.
 */
export default function PlaytomicPage() {
  return (
    <>
      <DesktopOnlyNotice module="Playtomic" />
      <div className="hidden sm:block">
        <PlaytomicView />
      </div>
    </>
  );
}
