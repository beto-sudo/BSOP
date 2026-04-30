'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { VentasView } from '@/components/ventas/ventas-view';

/**
 * @module Ventas (RDB)
 * @responsive desktop-only
 */
export default function VentasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.ventas">
      <DesktopOnlyNotice module="Ventas" />
      <div className="hidden sm:block">
        <VentasView />
      </div>
    </RequireAccess>
  );
}
