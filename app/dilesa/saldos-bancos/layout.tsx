import { type ReactNode } from 'react';
import {
  HubAccessRedirect,
  ModulePage,
  ModuleHeader,
  RoutedModuleTabs,
} from '@/components/module-page';

/**
 * Layout compartido del módulo Saldos Bancos (DILESA) — patrón "module with
 * submodules / routed tabs" (ADR-005 + ADR-030):
 *
 * - `/dilesa/saldos-bancos`          → tab "Saldos" (default landing).
 * - `/dilesa/saldos-bancos/estados`  → tab "Estados de cuenta".
 *
 * El padre `dilesa.saldos-bancos` queda como umbrella (sidebar); cada tab
 * tiene su sub-slug que gobierna acceso real al contenido (los gates viven
 * en cada sub-page; `<RoutedModuleTabs>` oculta tabs sin permiso).
 * Iniciativa `conciliacion-bancaria` v0 (tab Estados + sub-slugs).
 */
const TABS = [
  {
    label: 'Saldos',
    href: '/dilesa/saldos-bancos',
    exact: true,
    module: 'dilesa.saldos-bancos.saldos',
  },
  {
    label: 'Estados de cuenta',
    href: '/dilesa/saldos-bancos/estados',
    module: 'dilesa.saldos-bancos.estados',
  },
] as const;

export default function SaldosBancosLayout({ children }: { children: ReactNode }) {
  return (
    <ModulePage>
      <ModuleHeader
        title="Bancos"
        subtitle="Saldo actual, estados de cuenta y conciliación mensual de las cuentas bancarias de DILESA"
      />
      <HubAccessRedirect tabs={TABS} />
      <RoutedModuleTabs tabs={TABS} />
      {children}
    </ModulePage>
  );
}
