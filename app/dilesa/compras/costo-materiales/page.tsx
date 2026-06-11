'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { CostoMaterialesModule } from '@/components/compras/costo-materiales-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Compras · Costo materiales (DILESA)
 * @responsive desktop-only
 *
 * Tab "Costo materiales" del hub Compras: captura del costo final de
 * materiales por vivienda terminada (dato que hoy sale de CONTPAQ), puente
 * post-cutoff del grid Coda "Construcción por Lote" mientras no exista el
 * módulo de control de materiales en BSOP. Gate: sub-slug
 * `dilesa.compras.costo_materiales` (ADR-030 SS5); el write se re-valida
 * server-side en `dilesa.fn_construccion_capturar_costo_materiales`.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.costo_materiales">
      <DesktopOnlyNotice module="Costo materiales" />
      <div className="hidden sm:block">
        <CostoMaterialesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
