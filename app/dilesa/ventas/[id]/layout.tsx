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
 *   - Rama captura: solo la barra de tabs encima del formulario de fase, que
 *     ya trae su propio header/ficha (`CapturarFaseHeader`) y gate de fase. No
 *     se monta el provider pesado: la captura no necesita CxC/adjuntos.
 */

import type { ReactNode } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { RequireAccess } from '@/components/require-access';
import { VentaDetalleProvider } from '@/components/dilesa/venta-detalle/provider';
import { VentaExpedienteShell, VentaExpedienteTabs } from '@/components/dilesa/venta-detalle/shell';

export default function VentaDetalleLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const isCaptura = pathname?.includes('/capturar/') ?? false;

  if (isCaptura) {
    return (
      <>
        <div className="container mx-auto max-w-3xl px-4 pt-4 sm:px-6">
          <VentaExpedienteTabs id={id} />
        </div>
        {children}
      </>
    );
  }

  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.lista">
      <VentaDetalleProvider ventaId={id}>
        <VentaExpedienteShell>{children}</VentaExpedienteShell>
      </VentaDetalleProvider>
    </RequireAccess>
  );
}
