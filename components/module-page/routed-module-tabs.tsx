'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

import { usePermissions } from '@/components/providers';
import { canAccessModulo } from '@/lib/permissions';

export interface RoutedModuleTab {
  /** Etiqueta visible del tab */
  label: ReactNode;
  /** Ruta del tab. Para el default (landing) suele ser `/<modulo>`. */
  href: string;
  /**
   * Si true, este tab queda activo cuando `pathname === href`. Si false,
   * queda activo cuando `pathname` empieza con `href` (default). El default
   * conviene para sub-rutas: `/inventario/levantamientos/[id]/capturar`
   * mantiene "Levantamientos" activo. El `exact: true` se usa en el primer
   * tab (landing) para evitar que sea match comodín.
   */
  exact?: boolean;
  /**
   * Slug de módulo que gate-ea este tab. Si está set, el tab se oculta
   * cuando el usuario no tiene `acceso_lectura` al sub-slug. Si está
   * undefined, siempre visible (compat con módulos sin granularidad de
   * sub-slug). Patrón canónico para módulos con sub-páginas — ver
   * iniciativa `submodule-permissions`.
   */
  module?: string;
}

export interface RoutedModuleTabsProps {
  tabs: ReadonlyArray<RoutedModuleTab>;
}

/**
 * Tabs routed (Next.js Link-based) con el mismo estilo visual que
 * `<ModuleTabs>`. El tab activo se deriva de `usePathname()`. Se oculta
 * cuando hay menos de 2 tabs visibles (paridad con `<ModuleTabs>`).
 *
 * Si un tab declara `module`, se filtra por `canAccessModulo(perms, module)`.
 * Durante el loading inicial de permisos, las tabs se muestran sin filtrar
 * para evitar flash. Admin bypass aplica vía `canAccessModulo`.
 *
 * Diseñado para vivir en un `layout.tsx` compartido por las rutas hermanas
 * de un módulo (ver ADR-005 — `module-page-submodules`).
 */
export function RoutedModuleTabs({ tabs }: RoutedModuleTabsProps) {
  const pathname = usePathname();
  const { permissions } = usePermissions();

  // Durante loading, mostrar todas las tabs sin filtrar (evita flash).
  // Una vez cargado, filtrar por sub-slug si el tab lo declara.
  const visibleTabs = permissions.loading
    ? tabs
    : tabs.filter((tab) => !tab.module || canAccessModulo(permissions, tab.module));

  if (visibleTabs.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-2 border-b" role="tablist">
      {visibleTabs.map(({ label, href, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={[
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              active
                ? 'border-emerald-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
