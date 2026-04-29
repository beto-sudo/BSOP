import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout compartido del módulo Productos (RDB).
 *
 * Sigue el patrón "module with submodules / routed tabs" descrito en
 * ADR-005 (`docs/adr/005_module_with_submodules_routed_tabs.md`):
 *
 * - `/rdb/productos`           → tab "Catálogo" (default landing).
 * - `/rdb/productos/recetas`   → tab "Recetas".
 * - `/rdb/productos/auditoria` → tab "Auditoría".
 * - `/rdb/productos/analisis`  → tab "Análisis".
 *
 * El strip de tabs vive aquí para que las 4 rutas hermanas mantengan la
 * navegación consistente sin sumar entradas separadas al sidebar.
 *
 * `<RequireAccess>` se mantiene en cada page individual (defense in
 * depth) — el layout no lo wrappea para no contaminar el árbol con
 * un wrapper extra cuando los pages ya tienen el suyo.
 */
const TABS = [
  { label: 'Catálogo', href: '/rdb/productos', exact: true },
  { label: 'Recetas', href: '/rdb/productos/recetas' },
  { label: 'Auditoría', href: '/rdb/productos/auditoria' },
  { label: 'Análisis', href: '/rdb/productos/analisis' },
] as const;

export default function ProductosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
