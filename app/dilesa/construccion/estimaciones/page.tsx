'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { EstimacionesModule } from '@/components/dilesa/estimaciones-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Estimaciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Estimaciones" del hub Construcción (iniciativa dilesa-estimaciones
 * · Sprint 3). Lista filtrable de las filas en `dilesa.estimaciones` con
 * desglose mínimo (código, contratista, monto neto, estado) + acceso al
 * detalle por click en fila.
 *
 * Gate: sub-slug `dilesa.construccion.estimaciones` (creado en Sprint 2).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.estimaciones">
      <DesktopOnlyNotice module="Estimaciones" />
      <div className="hidden sm:block">
        <EstimacionesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
