import { type ReactNode } from 'react';
import { RequireAccess } from '@/components/require-access';
import { ModulePage, ModuleHeader, RoutedModuleTabs } from '@/components/module-page';

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
 * misma navegación, manteniendo el contexto del módulo. `<RequireAccess>`
 * también vive aquí: aplica al árbol entero, los pages internos no lo
 * repiten.
 */
const TABS = [
  { label: 'Stock', href: '/rdb/inventario', exact: true },
  { label: 'Movimientos', href: '/rdb/inventario/movimientos' },
  { label: 'Levantamientos', href: '/rdb/inventario/levantamientos' },
] as const;

export default function InventarioLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
      <ModulePage>
        <ModuleHeader title="Inventario" subtitle="Control de stock y movimientos" />
        <RoutedModuleTabs tabs={TABS} />
        {children}
      </ModulePage>
    </RequireAccess>
  );
}
