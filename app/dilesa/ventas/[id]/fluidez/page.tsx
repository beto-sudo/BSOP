'use client';

/**
 * Tab «Fluidez» del expediente de venta DILESA (iniciativa
 * dilesa-fluidez-pipeline). Cómo va la venta contra el objetivo, fase por fase.
 * Consume el `VentaDetalleProvider` del layout `[id]/layout.tsx`. Reusa el slug
 * RBAC del Pipeline (misma lectura del pipeline) — sin sub-slug nuevo.
 *
 * @module Venta · Fluidez (DILESA)
 * @responsive desktop-only
 */
import { RequireAccess } from '@/components/require-access';
import { FluidezTabBody } from '@/components/dilesa/venta-detalle/fluidez-tab';

export default function VentaFluidezPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.pipeline">
      <FluidezTabBody />
    </RequireAccess>
  );
}
