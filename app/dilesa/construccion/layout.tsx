import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout compartido del hub Construcción (DILESA).
 *
 * Implementa el patrón "module with submodules / routed tabs" descrito en
 * ADR-005 (`docs/adr/005_module_with_submodules_routed_tabs.md`) con el
 * mecanismo de sub-slugs por tab de ADR-030
 * (`docs/adr/030_submodule_permissions.md`):
 *
 *   /dilesa/construccion              → tab "Obras" (default landing).
 *   /dilesa/construccion/contratos    → tab "Contratos".
 *   /dilesa/construccion/contratistas → tab "Contratistas".
 *   /dilesa/construccion/prototipos   → tab "Prototipos".
 *
 * El strip de tabs vive aquí para que cualquier ruta del hub (incluyendo
 * sub-detalles profundos como `/contratos/[id]` o `/prototipos/[id]`)
 * muestre la misma navegación, manteniendo el contexto del módulo.
 *
 * Cada `module` en el TABS array es un sub-slug que `<RoutedModuleTabs>`
 * filtra automáticamente — tabs sin permiso quedan ocultas. Los gates de
 * acceso viven en cada sub-page (ADR-030 SS5), no en el layout — así el
 * AccessDenied de cada page muestra el sub-slug específico faltante en
 * vez del padre (que sí estaría accesible vía otra tab).
 *
 * El sub-slug `dilesa.construccion.contratos` ya existía desde Sprint 4
 * (Captura) y ahora gobierna también la lista/detalle del tab — mismo
 * dominio funcional.
 */
const TABS = [
  {
    label: 'Obras',
    href: '/dilesa/construccion',
    exact: true,
    module: 'dilesa.construccion.obras',
  },
  {
    label: 'Contratos',
    href: '/dilesa/construccion/contratos',
    module: 'dilesa.construccion.contratos',
  },
  {
    label: 'Contratistas',
    href: '/dilesa/construccion/contratistas',
    module: 'dilesa.construccion.contratistas',
  },
  {
    label: 'Prototipos',
    href: '/dilesa/construccion/prototipos',
    module: 'dilesa.construccion.prototipos',
  },
] as const;

export default function ConstruccionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
