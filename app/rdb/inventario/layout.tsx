import { type ReactNode } from 'react';
import {
  HubAccessRedirect,
  ModulePage,
  ModuleHeader,
  RoutedModuleTabs,
} from '@/components/module-page';

/**
 * Layout compartido del módulo Inventario (RDB).
 *
 * Implementa el patrón "module with submodules / routed tabs" descrito en
 * ADR-005 (`docs/adr/005_module_with_submodules_routed_tabs.md`):
 *
 * - `/rdb/inventario`              → tab "Stock" (default landing).
 * - `/rdb/inventario/movimientos`  → tab "Movimientos".
 * - `/rdb/inventario/levantamientos` (+ sub-detalles) → tab "Levantamientos".
 *
 * El strip de tabs vive aquí para que cualquier ruta del módulo (incluidos
 * sub-detalles profundos como `/levantamientos/[id]/capturar`) muestre la
 * misma navegación, manteniendo el contexto del módulo.
 *
 * Cada `module` en el TABS array es un sub-slug que `<RoutedModuleTabs>`
 * filtra automáticamente — tabs sin permiso quedan ocultas. Los gates de
 * acceso viven en cada sub-page (ver iniciativa `submodule-permissions`),
 * el layout solo monta tabs y wrapper visual.
 */
const TABS = [
  { label: 'Stock', href: '/rdb/inventario', exact: true, module: 'rdb.inventario.stock' },
  {
    label: 'Movimientos',
    href: '/rdb/inventario/movimientos',
    module: 'rdb.inventario.movimientos',
  },
  {
    label: 'Levantamientos',
    href: '/rdb/inventario/levantamientos',
    module: 'rdb.inventario.levantamientos',
  },
] as const;

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePage>
      <ModuleHeader title="Inventario" subtitle="Control de stock y movimientos" />
      <HubAccessRedirect tabs={TABS} />
      <RoutedModuleTabs tabs={TABS} />
      {children}
    </ModulePage>
  );
}
