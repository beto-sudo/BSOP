'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PlaytomicView } from '@/components/playtomic/playtomic-view';

/**
 * @module Playtomic (RDB)
 * @responsive desktop-only
 */
export default function PlaytomicPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
      <DesktopOnlyNotice module="Playtomic" />
      <div className="hidden sm:block">
        <PlaytomicView />
      </div>
    </RequireAccess>
  );
}
