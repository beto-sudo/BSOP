import { type ReactNode } from 'react';
import {
  HubAccessRedirect,
  ModulePage,
  ModuleHeader,
  RoutedModuleTabs,
} from '@/components/module-page';
import { TeTocaStrip } from '@/components/gasto/te-toca-strip';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * Layout del módulo Cuentas por Pagar (DILESA · CxP). Patrón routed tabs
 * (ADR-005, `docs/adr/005_module_with_submodules_routed_tabs.md`) +
 * sub-slugs por tab (ADR-030):
 *
 *   /dilesa/cxp               → tab "Facturas" (default landing).
 *   /dilesa/cxp/programacion  → tab "Programación" (facturas por pagar → pagos).
 *   /dilesa/cxp/pagos         → tab "Pagos" (aprobar / marcar pagado / cancelar).
 *   /dilesa/cxp/aging         → tab "Saldos" (antigüedad por proveedor).
 *   /dilesa/cxp/proveedores   → tab "Proveedores" (agregado por proveedor).
 *
 * El padre `dilesa.cxp` es umbrella del sidebar; cada tab tiene su sub-slug
 * que gobierna acceso real al contenido. `<RoutedModuleTabs>` filtra
 * automáticamente las tabs sin permiso. Los gates viven en cada page.
 *
 * Ver docs/planning/cxp.md (rollout DILESA + Sprint 4).
 */
const TABS = [
  {
    label: 'Facturas',
    href: '/dilesa/cxp',
    exact: true,
    module: 'dilesa.cxp.facturas',
  },
  {
    label: 'Programación',
    href: '/dilesa/cxp/programacion',
    module: 'dilesa.cxp.programacion',
  },
  {
    label: 'Pagos',
    href: '/dilesa/cxp/pagos',
    module: 'dilesa.cxp.pagos',
  },
  {
    label: 'Saldos',
    href: '/dilesa/cxp/aging',
    module: 'dilesa.cxp.aging',
  },
  {
    label: 'Proveedores',
    href: '/dilesa/cxp/proveedores',
    module: 'dilesa.cxp.proveedores',
  },
] as const;

export default function CxpLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePage>
      <ModuleHeader title="Cuentas por Pagar" subtitle="Facturas de egreso, saldos y proveedores" />
      <div className="px-4 pt-3 sm:px-6">
        <TeTocaStrip empresaId={DILESA_EMPRESA_ID} empresa="dilesa" />
      </div>
      <HubAccessRedirect tabs={TABS} />
      <RoutedModuleTabs tabs={TABS} />
      {children}
    </ModulePage>
  );
}
