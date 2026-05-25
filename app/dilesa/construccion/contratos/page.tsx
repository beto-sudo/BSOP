'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ContratosModule } from '@/components/dilesa/contratos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Contratos (DILESA)
 * @responsive desktop-only
 *
 * Tab "Contratos" del hub Construcción (sprint tabs+protos). Lista
 * filtrable de los contratos de construcción + botón al form combinado
 * que crea contrato + arranca N lotes en una sola operación.
 *
 * Click en una fila → /dilesa/construccion/contratos/[id] con la ficha
 * completa: datos generales, lotes asignados, KPIs MO.
 *
 * Gate: sub-slug `dilesa.construccion.contratos` (ADR-030 SS5). El mismo
 * sub-slug gobierna tanto el form de captura (Sprint 4) como la
 * lista/detalle. write=true habilita el botón "Nuevo contrato".
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratos">
      <DesktopOnlyNotice module="Contratos" />
      <div className="hidden sm:block">
        <ContratosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
