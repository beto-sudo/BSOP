'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { CosteoModule } from '@/components/dilesa/costeo-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Costeo (DILESA)
 * @responsive desktop-only
 *
 * Tab "Costeo" del hub Construcción (iniciativa dilesa-contratos-obra,
 * Sprint 3; rediseñado en dilesa-compras). Vista de CapEx del desarrollo:
 * presupuesto vs gasto real por concepto/etapa (Capa A,
 * `erp.presupuesto_partidas` — ADR-040) + contratado/saldo de los contratos de
 * obra (Capa B). Ver ADR-038.
 *
 * Gate: sub-slug `dilesa.construccion.costeo` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.costeo">
      <DesktopOnlyNotice module="Costeo" />
      <div className="hidden sm:block">
        <CosteoModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
