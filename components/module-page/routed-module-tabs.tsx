'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

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
}

export interface RoutedModuleTabsProps {
  tabs: ReadonlyArray<RoutedModuleTab>;
}

/**
 * Tabs routed (Next.js Link-based) con el mismo estilo visual que
 * `<ModuleTabs>`. El tab activo se deriva de `usePathname()`. Se oculta
 * cuando hay menos de 2 tabs (paridad con `<ModuleTabs>`).
 *
 * Diseñado para vivir en un `layout.tsx` compartido por las rutas hermanas
 * de un módulo (ver ADR-005 — `module-page-submodules`).
 */
export function RoutedModuleTabs({ tabs }: RoutedModuleTabsProps) {
  const pathname = usePathname();
  if (tabs.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-2 border-b" role="tablist">
      {tabs.map(({ label, href, exact }) => {
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
