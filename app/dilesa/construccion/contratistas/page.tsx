'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ContratistasModule } from '@/components/dilesa/contratistas-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Contratistas (DILESA)
 * @responsive desktop-only
 *
 * Tab "Contratistas" del hub Construcción (sprint tabs+protos). Catálogo
 * de contratistas con KPIs derivados: obras en curso, obras terminadas,
 * MO ejecutado total, REPSE, retención. Lectura pura.
 *
 * Contratistas viven en `erp.personas` (tipo='contratista') con satélite
 * `dilesa.contratistas_datos` para campos específicos (ADR-032 D2).
 *
 * Gate: sub-slug `dilesa.construccion.contratistas` (ADR-030 SS5). El
 * slug top-level `dilesa.contratistas` fue deprecado en la migración
 * 20260525152711_dilesa_construccion_tabs_hub.sql — el sub-slug toma su
 * lugar (con backfill defensivo de permisos).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.contratistas">
      <DesktopOnlyNotice module="Contratistas" />
      <div className="hidden sm:block">
        <ContratistasModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
