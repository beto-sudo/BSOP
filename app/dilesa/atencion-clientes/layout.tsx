import { type ReactNode } from 'react';
import { RoutedModuleTabs } from '@/components/module-page';

/**
 * Layout de Atención a Clientes (DILESA). Dos tabs sobre el mismo módulo
 * `dilesa.atencion_clientes` (sin sub-slugs — ambos comparten el permiso):
 *
 *   /dilesa/atencion-clientes            → "Por hacer" (cola de trabajo).
 *   /dilesa/atencion-clientes/respuestas → "Respuestas" (encuestas respondidas).
 *
 * Los tabs no declaran `module`, así que se ven juntos para quien tenga acceso
 * al módulo; el gate de acceso lo da cada page con `<RequireAccess>`.
 */
const TABS = [
  { label: 'Por hacer', href: '/dilesa/atencion-clientes', exact: true },
  { label: 'Respuestas', href: '/dilesa/atencion-clientes/respuestas' },
] as const;

export default function AtencionClientesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <RoutedModuleTabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
