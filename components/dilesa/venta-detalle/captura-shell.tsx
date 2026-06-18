'use client';

/**
 * Shell de la rama **captura** del expediente de venta DILESA.
 *
 * Hermana ligera de `VentaExpedienteShell`: monta la misma "Zona A"
 * persistente (back-link + ficha `OperacionResumen` + barra de tabs) por
 * encima del formulario de la fase, para que la captura se vea idéntica al
 * expediente — mismo ancho (`max-w-6xl`), tabs **debajo** de la ficha y sin
 * parpadeo al cambiar de fase o tab (la Zona A vive en el layout, no en el
 * page).
 *
 * No monta el `VentaDetalleProvider` pesado (CxC, adjuntos): la captura solo
 * necesita el resumen liviano. Lo carga **una vez** con `useVentaResumen` y lo
 * expone por contexto (`useVentaCapturaResumen`) — así las páginas que también
 * lo usan (F13 cuadratura, F10/F11 contexto de fases previas) no recargan.
 *
 * Fail-soft: si el resumen no carga (error o scope de vendedor) la Zona A
 * cae al back-link + tabs y la captura sigue; el gate real es el
 * `<RequireAccess>` de cada page de fase.
 */

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { OperacionResumen } from '@/components/dilesa/operacion-resumen';
import { Skeleton } from '@/components/ui/skeleton';
import { useVentaResumen, type VentaResumenState } from '@/lib/dilesa/use-venta-resumen';
import { VentaExpedienteTabs } from './tabs';

const VentaCapturaResumenContext = createContext<VentaResumenState | null>(null);

/**
 * Resumen de la venta cargado por el shell de captura. Las páginas de fase lo
 * consumen para su propia lógica (cuadratura, contexto de fases previas) sin
 * recargarlo. Debe usarse dentro de `VentaCapturaShell`.
 */
export function useVentaCapturaResumen(): VentaResumenState {
  const ctx = useContext(VentaCapturaResumenContext);
  if (!ctx) {
    throw new Error('useVentaCapturaResumen debe usarse dentro de <VentaCapturaShell>.');
  }
  return ctx;
}

export function VentaCapturaShell({ id, children }: { id: string; children: ReactNode }) {
  const resumen = useVentaResumen(id);

  const clienteNombre = resumen.status === 'ready' ? resumen.props.cliente.nombre : null;
  const identificador = resumen.status === 'ready' ? resumen.props.vivienda.identificador : null;

  return (
    <VentaCapturaResumenContext.Provider value={resumen}>
      {/* Zona A — cabecera persistente (idéntica al expediente). */}
      <div className="container mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <Link
          href={`/dilesa/ventas/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-4" />
          Volver a {clienteNombre || 'la venta'}
          {identificador ? ` (${identificador})` : ''}
        </Link>

        {resumen.status === 'loading' ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : resumen.status === 'ready' ? (
          <OperacionResumen {...resumen.props} />
        ) : null}

        <VentaExpedienteTabs id={id} />
      </div>

      {children}
    </VentaCapturaResumenContext.Provider>
  );
}
