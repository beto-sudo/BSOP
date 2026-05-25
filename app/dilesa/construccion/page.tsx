'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ConstruccionModule } from '@/components/dilesa/construccion-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Obras (DILESA)
 * @responsive desktop-only
 *
 * Default landing del hub Construcción (sprint tabs+protos). Lista de
 * construcciones por obra (~1,372 obras importadas en Sprint 2):
 * unidad, prototipo, contratista, avance%, estado, fechas críticas.
 * Click navega a /dilesa/construccion/[id] con la ficha completa,
 * timeline de etapas y tareas terminadas/pendientes.
 *
 * Gate: sub-slug `dilesa.construccion.obras` (ADR-030 SS5). El padre
 * `dilesa.construccion` queda como umbrella en sidebar; el sub-slug
 * gobierna el contenido real de esta tab.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.obras">
      <DesktopOnlyNotice module="Construcción" />
      <div className="hidden sm:block">
        <ConstruccionModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
