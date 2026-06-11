'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { usePermissions } from '@/components/providers';
import { canAccessModulo } from '@/lib/permissions';
import type { RoutedModuleTab } from './routed-module-tabs';

/**
 * Compañero de `<RoutedModuleTabs>` para hubs con sub-slugs (ADR-030).
 *
 * Si el usuario está parado en la URL de un tab cuyo sub-slug NO le es
 * accesible (típico: el landing default del hub gobernado por el primer tab,
 * p. ej. `/dilesa/compras` → `dilesa.compras.ordenes`), lo redirige al primer
 * tab que SÍ puede leer. Así un rol con permisos parciales del hub aterriza
 * en contenido útil en vez de en `<AccessDenied>` con tabs arriba.
 *
 * No renderiza nada y no toca rutas profundas que no matchean ningún tab
 * (p. ej. wizards como `/dilesa/ventas/nueva` — su gate vive en la page).
 * Sin ningún tab accesible es no-op: el `<RequireAccess>` de la sub-page
 * muestra el denied normal (SS5). Montar en el `layout.tsx` del hub con los
 * mismos `TABS` que `<RoutedModuleTabs>`.
 */
export function HubAccessRedirect({ tabs }: { tabs: ReadonlyArray<RoutedModuleTab> }) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = usePermissions();

  useEffect(() => {
    if (permissions.loading || permissions.isAdmin) return;
    const current = tabs.find((tab) =>
      tab.exact
        ? pathname === tab.href
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    );
    if (!current?.module || canAccessModulo(permissions, current.module)) return;
    const target = tabs.find((tab) => tab.module && canAccessModulo(permissions, tab.module));
    if (target && target.href !== pathname) router.replace(target.href);
  }, [pathname, permissions, router, tabs]);

  return null;
}
