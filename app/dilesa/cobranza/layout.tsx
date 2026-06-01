import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout del hub Cobranza (DILESA · CxC). Patrón routed tabs (ADR-005) +
 * sub-slugs por tab (ADR-030):
 *
 *   /dilesa/cobranza        → tab "Pagos" (captura desde administración).
 *   /dilesa/cobranza/aging  → tab "Saldos" (antigüedad por cliente).
 *
 * El padre `dilesa.cobranza` es umbrella del sidebar; cada tab tiene su
 * sub-slug que gobierna acceso real. Los gates viven en cada page.
 */
const TABS = [
  {
    label: 'Pagos',
    href: '/dilesa/cobranza',
    exact: true,
    module: 'dilesa.cobranza.pagos',
  },
  {
    label: 'Saldos',
    href: '/dilesa/cobranza/aging',
    module: 'dilesa.cobranza.aging',
  },
] as const;

export default function CobranzaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
