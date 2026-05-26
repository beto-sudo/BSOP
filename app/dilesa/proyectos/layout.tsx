import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout compartido del módulo Proyectos (DILESA).
 *
 * Sigue el patrón "module with submodules / routed tabs" descrito en
 * ADR-005 (`docs/adr/005_module_with_submodules_routed_tabs.md`) y la
 * granularidad RBAC por sub-página de ADR-030
 * (`docs/adr/030_submodule_permissions.md`):
 *
 * - `/dilesa/proyectos`               → tab "Activos" (default landing).
 * - `/dilesa/proyectos/anteproyectos` → tab "Anteproyectos".
 *
 * El strip de tabs vive aquí para que las 2 rutas hermanas mantengan la
 * navegación consistente sin sumar entradas separadas al sidebar — el
 * padre `dilesa.proyectos` queda como umbrella en sidebar, los sub-slugs
 * gobiernan acceso real al contenido (ADR-030 SS1-SS7).
 *
 * `<RequireAccess>` se mantiene en cada page individual (defense in
 * depth) — el layout no lo wrappea para no contaminar el árbol con
 * un wrapper extra cuando los pages ya tienen el suyo.
 *
 * Sprint 1 de la iniciativa `dilesa-proyectos-anteproyectos` (ver
 * `docs/planning/dilesa-proyectos-anteproyectos.md`).
 */
const TABS = [
  {
    label: 'Activos',
    href: '/dilesa/proyectos',
    exact: true,
    module: 'dilesa.proyectos.activos',
  },
  {
    label: 'Anteproyectos',
    href: '/dilesa/proyectos/anteproyectos',
    module: 'dilesa.proyectos.anteproyectos',
  },
] as const;

export default function ProyectosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
