'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ComprasProximamente } from '@/components/compras/compras-proximamente';

/**
 * @module Compras · Recepciones (DILESA)
 * @responsive desktop-only
 *
 * Tab "Recepciones" del hub Compras (iniciativa dilesa-compras · Sprint 2).
 * Recibir lo comprado devenga (`ejercido`) contra la partida sin mover
 * inventario (vía `oc_recibir_linea_partida`). Gate: sub-slug
 * `dilesa.compras.recepciones` (ADR-030 SS5).
 *
 * Placeholder de Fase A — la recepción llega en Fase C (con la RPC nueva).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.compras.recepciones">
      <DesktopOnlyNotice module="Recepciones" />
      <div className="hidden sm:block">
        <ComprasProximamente
          titulo="Recepciones"
          descripcion="Recepción de lo comprado: devenga el ejercido contra la partida del presupuesto, sin mover inventario. Llega en la Fase C del Sprint 2."
        />
      </div>
    </RequireAccess>
  );
}
