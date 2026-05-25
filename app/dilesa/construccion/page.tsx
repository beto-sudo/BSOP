'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ConstruccionModule } from '@/components/dilesa/construccion-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción (DILESA)
 * @responsive desktop-only
 *
 * Iniciativa dilesa-construccion · Sprint 3 (UI lectura). Lista de
 * construcciones por obra (~1,372 obras importadas en Sprint 2):
 * unidad, prototipo, contratista, avance%, estado, fechas críticas.
 * Click navega a /dilesa/construccion/[id] con la ficha completa,
 * timeline de etapas y tareas terminadas/pendientes.
 *
 * Lectura pura — captura (arrancar obra, registrar tarea) entra en
 * Sprint 4. Sub-slugs de escritura se introducirán en esa fase.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion">
      <DesktopOnlyNotice module="Construcción" />
      <div className="hidden sm:block">
        <ConstruccionModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
