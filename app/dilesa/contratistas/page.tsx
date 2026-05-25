'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ContratistasModule } from '@/components/dilesa/contratistas-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Contratistas (DILESA)
 * @responsive desktop-only
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura). Catálogo de
 * contratistas con KPIs derivados: obras en curso, obras terminadas,
 * MO ejecutado total, REPSE, retención. Lectura pura.
 *
 * Contratistas viven en `erp.personas` (tipo='contratista') con satélite
 * `dilesa.contratistas_datos` para campos específicos (ADR-032 D2).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.contratistas">
      <DesktopOnlyNotice module="Contratistas" />
      <div className="hidden sm:block">
        <ContratistasModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
