import { type ReactNode } from 'react';
import { HubAccessRedirect, RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout del hub Portafolio (DILESA) — routed tabs ADR-005 + sub-slugs ADR-030.
 *
 *   /dilesa/portafolio            → tab "Inventario" (default landing).
 *   /dilesa/portafolio/evaluacion → tab "Evaluación" (terrenos en compra).
 *
 * Cada `module` es un sub-slug que `<RoutedModuleTabs>` filtra por permiso; el
 * gate de acceso vive en cada sub-page (ADR-030 SS5). El padre `dilesa.portafolio`
 * queda de umbrella en el sidebar.
 */
const TABS = [
  {
    label: 'Inventario',
    href: '/dilesa/portafolio',
    exact: true,
    module: 'dilesa.portafolio.inventario',
  },
  {
    label: 'Evaluación',
    href: '/dilesa/portafolio/evaluacion',
    module: 'dilesa.portafolio.evaluacion',
  },
  {
    label: 'Prediales',
    href: '/dilesa/portafolio/prediales',
    module: 'dilesa.portafolio.prediales',
  },
] as const;

export default function PortafolioLayout({ children }: { children: ReactNode }) {
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
