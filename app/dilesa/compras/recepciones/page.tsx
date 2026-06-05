'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { RecepcionesModule } from '@/components/compras/recepciones-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Compras · Recepciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Recepciones" del hub Compras (iniciativa dilesa-compras · Sprint 2
 * Fase C). Recibir lo comprado devenga (`ejercido`) contra la partida sin
 * mover inventario (vía `oc_recibir_linea_partida`). Gate: sub-slug
 * `dilesa.compras.recepciones` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.recepciones">
      <DesktopOnlyNotice module="Recepciones" />
      <div className="hidden sm:block">
        <RecepcionesModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
