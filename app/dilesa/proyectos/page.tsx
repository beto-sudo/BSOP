'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProyectosModule } from '@/components/dilesa/proyectos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proyectos · Activos (DILESA)
 * @responsive desktop-only
 *
 * Tab por defecto del hub Proyectos (ver `app/dilesa/proyectos/layout.tsx`
 * y ADR-030). Mantiene el contenido histórico de `/dilesa/proyectos`
 * (proyectos en curso + terminados); los anteproyectos viven en la tab
 * hermana `/dilesa/proyectos/anteproyectos` (Sprint 2 los puebla — hoy
 * skeleton).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.activos">
      <DesktopOnlyNotice module="Proyectos" />
      <div className="hidden sm:block">
        <ProyectosModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
