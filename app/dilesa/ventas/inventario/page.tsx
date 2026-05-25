'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { InventarioModule } from '@/components/dilesa/inventario-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Ventas · Inventario (DILESA)
 * @responsive desktop-only
 *
 * Tab "Inventario" del hub Ventas (sprint tabs-hub). Movido desde el
 * top-level `/dilesa/inventario` — el slug top-level `dilesa.inventario`
 * se elimina en la migración 20260525112633_dilesa_ventas_tabs_hub.sql
 * y el sub-slug `dilesa.ventas.inventario` toma su lugar (con backfill
 * defensivo de permisos clonados desde el padre `dilesa.ventas`).
 *
 * Vista comercial complementaria a Portafolio:
 * - Portafolio = patrimonio (todos los activos, incluido vendido).
 * - Inventario = unidades disponibles HOY para asignar a un cliente.
 *
 * Lectura pura — al hacer click "Asignar a cliente" navega al form de
 * Solicitud de Asignación con la unidad preseleccionada.
 *
 * Gate: sub-slug `dilesa.ventas.inventario` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.inventario">
      <DesktopOnlyNotice module="Inventario" />
      <div className="hidden sm:block">
        <InventarioModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
