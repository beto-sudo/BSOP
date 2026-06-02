import { type ReactNode } from 'react';
import { ModulePage, ModuleHeader, RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout del módulo Cuentas por Pagar (RDB · CxP). Patrón routed tabs
 * (ADR-005, `docs/adr/005_module_with_submodules_routed_tabs.md`) +
 * sub-slugs por tab (ADR-030):
 *
 *   /rdb/cxp              → tab "Facturas" (default landing).
 *   /rdb/cxp/aging        → tab "Saldos" (antigüedad por proveedor).
 *   /rdb/cxp/proveedores  → tab "Proveedores" (agregado por proveedor).
 *
 * El padre `rdb.cxp` es umbrella del sidebar; cada tab tiene su sub-slug
 * que gobierna acceso real al contenido. `<RoutedModuleTabs>` filtra
 * automáticamente las tabs sin permiso. Los gates viven en cada page.
 *
 * Ver docs/planning/cxp.md (Sprint 3).
 */
const TABS = [
  {
    label: 'Facturas',
    href: '/rdb/cxp',
    exact: true,
    module: 'rdb.cxp.facturas',
  },
  {
    label: 'Saldos',
    href: '/rdb/cxp/aging',
    module: 'rdb.cxp.aging',
  },
  {
    label: 'Proveedores',
    href: '/rdb/cxp/proveedores',
    module: 'rdb.cxp.proveedores',
  },
] as const;

export default function CxpLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePage>
      <ModuleHeader title="Cuentas por Pagar" subtitle="Facturas de egreso, saldos y proveedores" />
      <RoutedModuleTabs tabs={TABS} />
      {children}
    </ModulePage>
  );
}
