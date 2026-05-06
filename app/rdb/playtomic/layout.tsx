import { type ReactNode } from 'react';
import { RequireAccess } from '@/components/require-access';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout compartido del módulo Playtomic (RDB).
 *
 * Patrón "module with submodules / routed tabs" (ADR-005). Las 3 sub-rutas
 * comparten gate de acceso + strip de tabs, y cada `page.tsx` aporta solo
 * su contenido específico (header propio, KPIs, contenido).
 *
 * - `/rdb/playtomic`                       → tab "Dashboard" (default landing).
 * - `/rdb/playtomic/conciliacion`           → tab "Conciliación".
 * - `/rdb/playtomic/conciliacion/historial` → tab "Historial".
 * - `/rdb/playtomic/import-csv`             → tab "Import CSV".
 *
 * No se renderiza `<ModuleHeader>` aquí porque el dashboard ya trae su
 * propio `<HeaderSection>` con range selector + sync. Las sub-páginas
 * traen sus propios títulos en sus respectivos `<View>`.
 */
const TABS = [
  { label: 'Dashboard', href: '/rdb/playtomic', exact: true },
  { label: 'Conciliación', href: '/rdb/playtomic/conciliacion', exact: true },
  { label: 'Historial', href: '/rdb/playtomic/conciliacion/historial' },
  { label: 'Import CSV', href: '/rdb/playtomic/import-csv' },
] as const;

export default function PlaytomicLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.playtomic">
      <div className="space-y-4">
        <RoutedModuleTabs tabs={TABS} />
        {children}
      </div>
    </RequireAccess>
  );
}
