'use client';

import { RequireAccess } from '@/components/require-access';
import { PlaytomicView } from '@/components/playtomic/playtomic-view';

export default function PlaytomicPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
      <PlaytomicView />
    </RequireAccess>
  );
}
