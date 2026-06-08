'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { RuvModule } from '@/components/dilesa/ruv-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module RUV — Frentes (DILESA)
 * @responsive desktop-only
 *
 * Registro Único de Vivienda (INFONAVIT). Iniciativa `dilesa-ruv` (Sprint 3).
 * Listado de frentes (ofertas) con KPIs de avance + detail drawer con el
 * checklist de documentos del paquete. El detalle por vivienda (CUV + hitos del
 * trámite) vive en el módulo de Construcción. Ver docs/planning/dilesa-ruv.md.
 *
 * Gate: `dilesa.ruv` (Dirección + Gerente de Proyectos + Asistente de Proyectos
 * + admin). `RuvModule` usa filtros de estado local (no `useSearchParams`), así
 * que no requiere Suspense boundary (Next.js 16).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ruv">
      <DesktopOnlyNotice module="RUV — Frentes" />
      <div className="hidden sm:block">
        <RuvModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
