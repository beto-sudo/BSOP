'use client';

/**
 * Barra de tabs routed del expediente de venta DILESA (ADR-005/ADR-030).
 *
 * Presentacional y sin estado de venta: solo necesita el `id` para armar las
 * URLs. Vive en su propio módulo para que las dos cabeceras persistentes —
 * `VentaExpedienteShell` (rama expediente) y `VentaCapturaShell` (rama
 * captura) — la rendericen sin arrastrar el `VentaDetalleProvider`.
 */

import { RoutedModuleTabs } from '@/components/module-page';

export function VentaExpedienteTabs({ id }: { id: string }) {
  const base = `/dilesa/ventas/${id}`;
  return (
    <RoutedModuleTabs
      tabs={[
        { label: 'Operación', href: base, exact: true, module: 'dilesa.ventas.operacion' },
        { label: 'Pipeline', href: `${base}/pipeline`, module: 'dilesa.ventas.pipeline' },
        { label: 'Cuadratura', href: `${base}/cuadratura`, module: 'dilesa.ventas.cuadratura' },
        {
          label: 'Estado de cuenta',
          href: `${base}/estado-cuenta`,
          module: 'dilesa.ventas.estado_cuenta',
        },
        { label: 'Documentos', href: `${base}/documentos`, module: 'dilesa.ventas.documentos' },
        { label: 'Bitácora', href: `${base}/bitacora`, module: 'dilesa.ventas.bitacora' },
      ]}
    />
  );
}
