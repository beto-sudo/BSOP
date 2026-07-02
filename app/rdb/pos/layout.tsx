import { type ReactNode } from 'react';
import {
  HubAccessRedirect,
  ModulePage,
  ModuleHeader,
  RoutedModuleTabs,
} from '@/components/module-page';

/**
 * Layout del módulo POS propio de RDB (ADR-056, iniciativa rdb-pos-propio).
 *
 * Routed tabs (ADR-005/ADR-030):
 * - `/rdb/pos`        → tab "Captura" (default landing, rdb.pos.captura).
 * - `/rdb/pos/kds`    → tab "Cocina" (rdb.pos.kds — el monitor del KDS).
 * - `/rdb/pos/admin`  → tab "Admin" (rdb.pos.admin — estaciones y PINs,
 *                        sin backfill de permisos: solo admins globales).
 */
const TABS = [
  { label: 'Captura', href: '/rdb/pos', exact: true, module: 'rdb.pos.captura' },
  { label: 'Pedidos', href: '/rdb/pos/pedidos', module: 'rdb.pos.pedidos' },
  { label: 'Cocina', href: '/rdb/pos/kds', module: 'rdb.pos.kds' },
  { label: 'Admin', href: '/rdb/pos/admin', module: 'rdb.pos.admin' },
] as const;

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePage>
      <ModuleHeader title="Punto de Venta" subtitle="Captura, cocina y cobro — POS propio" />
      <HubAccessRedirect tabs={TABS} />
      <RoutedModuleTabs tabs={TABS} />
      {children}
    </ModulePage>
  );
}
