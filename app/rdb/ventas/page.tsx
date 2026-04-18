'use client';

import { RequireAccess } from '@/components/require-access';
import { VentasView } from '@/components/ventas/ventas-view';

export default function VentasPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.ventas">
      <VentasView />
    </RequireAccess>
  );
}
