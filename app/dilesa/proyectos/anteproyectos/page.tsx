'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { AnteproyectosModule } from '@/components/dilesa/anteproyectos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proyectos · Anteproyectos (DILESA)
 * @responsive desktop-only
 *
 * Tab "Anteproyectos" del hub Proyectos. Lista los rows de
 * `dilesa.proyectos` con `tipo='anteproyecto'` — evaluaciones de
 * viabilidad antes del arranque formal como desarrollo. Sprint 2 de la
 * iniciativa `dilesa-proyectos-anteproyectos`. Sprints 3-4 agregan
 * checklist canónico de tareas y conversión a desarrollo.
 */
export default function AnteproyectosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.anteproyectos">
      <DesktopOnlyNotice module="Anteproyectos" />
      <div className="hidden sm:block">
        <AnteproyectosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
