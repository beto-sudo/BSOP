'use client';

/**
 * Layout del expediente de venta DILESA — routed tabs (ADR-005/ADR-030).
 *
 * Iniciativa `dilesa-ventas-expediente-tabs`: el detalle deja de ser un único
 * page scroll-largo con tabs en `useState` y gana tabs con URL real, montados
 * en un layout compartido. Cubre tanto el expediente
 * (`/dilesa/ventas/[id]`, `/cuadratura`, `/documentos`, `/bitacora`) como la
 * captura de fases (`/[id]/capturar/*`) — así el menú **persiste al capturar**.
 *
 *   - Rama expediente: `VentaDetalleProvider` (carga la venta una vez; la
 *     navegación entre tabs no recarga) + `VentaExpedienteShell` (back-link +
 *     cabecera + ficha + tabs). Gate umbrella `dilesa.ventas.lista`; cada
 *     tab-page añade su sub-slug fino.
 *   - Rama captura: `VentaCapturaShell` monta la misma Zona A persistente
 *     (back-link + ficha + tabs, mismo `max-w-6xl`) por encima del formulario
 *     de fase — la captura se ve idéntica al expediente. No se monta el
 *     provider pesado: la captura no necesita CxC/adjuntos. El gate de fase es
 *     el `<RequireAccess>` de cada page.
 */

import type { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { RequireAccess } from '@/components/require-access';
import { VentaDetalleProvider } from '@/components/dilesa/venta-detalle/provider';
import { VentaExpedienteShell } from '@/components/dilesa/venta-detalle/shell';
import { VentaCapturaShell } from '@/components/dilesa/venta-detalle/captura-shell';

export default function VentaDetalleLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const isCaptura = pathname?.includes('/capturar/') ?? false;

  if (isCaptura) {
    return <VentaCapturaShell id={id}>{children}</VentaCapturaShell>;
  }

  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.lista">
      <VentaDetalleProvider ventaId={id}>
        <VentaExpedienteShell>{children}</VentaExpedienteShell>
      </VentaDetalleProvider>
    </RequireAccess>
  );
}
