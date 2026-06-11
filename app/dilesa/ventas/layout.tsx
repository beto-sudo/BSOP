'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
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
 * Cada `module` en el TABS array es un sub-slug que `<RoutedModuleTabs>`
 * filtra automáticamente — tabs sin permiso quedan ocultas. Los gates de
 * acceso viven en cada sub-page (ADR-030 SS5), no en el layout — así el
 * AccessDenied de cada page muestra el sub-slug específico faltante en
 * vez del padre.
 *
 * --- Por qué se ocultan las tabs en sub-rutas profundas ---
 *
 * El strip de tabs NO se renderiza en sub-páginas que tienen su propia
 * vista detallada (back-link incluido), porque agregar tabs ahí seria
 * confuso (el contexto visual ya cambió a "detalle de X"):
 *
 *   - /dilesa/ventas/[id]                       (detalle de venta)
 *   - /dilesa/ventas/nueva                       (form Fase 1)
 *   - /dilesa/ventas/[id]/capturar/*             (forms de captura por fase)
 *   - /dilesa/ventas/clientes/[id]               (detalle de cliente)
 *   - /dilesa/ventas/vendedores/[id]             (detalle de vendedor)
 *
 * Las tabs sí se muestran en las 5 URLs canónicas de cada tab + cualquier
 * otra sub-ruta directa de la tab (sin un siguiente segmento).
 *
 * Construcción/layout.tsx no hace este filtrado porque sus detalles
 * (`/dilesa/construccion/[id]`) son menos invasivos; aquí ya tenemos un
 * detalle de venta con header propio (back-link, badges, secciones) que
 * compite visualmente con un strip extra de tabs.
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
] as const;

/**
 * Hrefs que sí muestran tabs (las 5 URLs canónicas de cada tab).
 */
const TAB_HREFS: ReadonlySet<string> = new Set(TABS.map((t) => t.href));

/**
 * Resuelve si la ruta actual debe mostrar el strip de tabs.
 * - Las 5 URLs canónicas: SI.
 * - Sub-paths inmediatos de Clientes/Vendedores que son listados
 *   (segmento extra que no es UUID) — improbable, pero seguro mostrarlos.
 * - Cualquier otro sub-path: NO (detalle de venta, forms, etc.).
 */
function shouldShowTabs(pathname: string): boolean {
  // Match exacto con cualquiera de las URLs canónicas.
  if (TAB_HREFS.has(pathname)) return true;
  // No mostrar en detalles ni forms — son sub-rutas con su propia vista.
  return false;
}

export default function VentasLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showTabs = shouldShowTabs(pathname);

  return (
    <>
      <HubAccessRedirect tabs={TABS} />
      {showTabs ? (
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <RoutedModuleTabs tabs={TABS} />
        </div>
      ) : null}
      {children}
    </>
  );
}
