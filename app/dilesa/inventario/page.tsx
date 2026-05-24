'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { InventarioModule } from '@/components/dilesa/inventario-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Inventario (DILESA)
 * @responsive desktop-only
 *
 * Vista comercial complementaria a Portafolio:
 * - Portafolio = patrimonio (todos los activos, incluido vendido).
 * - Inventario = unidades disponibles HOY para asignar a un cliente.
 *
 * Lectura pura — al hacer click "Asignar a cliente" navega al form de
 * Solicitud de Asignación con la unidad preseleccionada.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.inventario">
      <DesktopOnlyNotice module="Inventario" />
      <div className="hidden sm:block">
        <InventarioModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
