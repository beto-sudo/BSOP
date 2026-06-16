import { type ReactNode } from 'react';
import { HubAccessRedirect, RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout compartido del hub Ventas (DILESA).
 *
 * Implementa el patrón "module with submodules / routed tabs" descrito en
 * ADR-005 (`docs/adr/005_module_with_submodules_routed_tabs.md`) con el
 * mecanismo de sub-slugs por tab de ADR-030
 * (`docs/adr/030_submodule_permissions.md`):
 *
 *   /dilesa/ventas              → tab "Ventas"      (default landing).
 *   /dilesa/ventas/inventario   → tab "Inventario"  (movido desde top-level).
 *   /dilesa/ventas/fases        → tab "Fases".
 *   /dilesa/ventas/clientes     → tab "Clientes".
 *   /dilesa/ventas/vendedores   → tab "Vendedores".
 *
 * El strip de tabs vive aquí para que cualquier ruta del hub (incluyendo
 * sub-detalles profundos como el detalle de venta `/dilesa/ventas/[id]`,
 * los forms de captura `/[id]/capturar/*`, `/nueva`, `/clientes/[id]` o
 * `/vendedores/[id]`) muestre la misma navegación, manteniendo el contexto
 * del módulo. Mismo criterio que `construccion/layout.tsx`.
 *
 * Cada `module` en el TABS array es un sub-slug que `<RoutedModuleTabs>`
 * filtra automáticamente — tabs sin permiso quedan ocultas. Los gates de
 * acceso viven en cada sub-page (ADR-030 SS5), no en el layout — así el
 * AccessDenied de cada page muestra el sub-slug específico faltante en
 * vez del padre.
 */
const TABS = [
  {
    label: 'Ventas',
    href: '/dilesa/ventas',
    exact: true,
    module: 'dilesa.ventas.lista',
  },
  {
    label: 'Inventario',
    href: '/dilesa/ventas/inventario',
    module: 'dilesa.ventas.inventario',
  },
  {
    label: 'Fases',
    href: '/dilesa/ventas/fases',
    module: 'dilesa.ventas.fases',
  },
  {
    label: 'Clientes',
    href: '/dilesa/ventas/clientes',
    module: 'dilesa.ventas.clientes',
  },
  {
    label: 'Vendedores',
    href: '/dilesa/ventas/vendedores',
    module: 'dilesa.ventas.vendedores',
  },
  {
    label: 'Promociones',
    href: '/dilesa/ventas/promociones',
    module: 'dilesa.ventas.promociones',
  },
] as const;

export default function VentasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HubAccessRedirect tabs={TABS} />
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
