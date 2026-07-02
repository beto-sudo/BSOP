'use client';

import { RequireAccess } from '@/components/require-access';
import { PosPedidosModule } from '@/components/pos/pedidos-module';

export default function PosPedidosPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.pos.pedidos">
      <PosPedidosModule />
    </RequireAccess>
  );
}
