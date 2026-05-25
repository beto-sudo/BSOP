'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { PrototiposModule } from '@/components/dilesa/prototipos-module';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Construcción · Prototipos (DILESA)
 * @responsive desktop-only
 *
 * Tab "Prototipos" del hub Construcción (sprint tabs+protos). Lista de
 * modelos de vivienda (`dilesa.productos`) con KPIs derivados de las
 * obras: último precio MO/m² histórico, total MO calculado, conteo de
 * obras en curso/terminadas.
 *
 * Click → detalle con planos (JSONB productos.planos), plantilla de
 * tareas con costo MO calculado por tarea, KPIs adicionales.
 *
 * Gate: sub-slug `dilesa.construccion.prototipos` (ADR-030 SS5).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.construccion.prototipos">
      <DesktopOnlyNotice module="Prototipos" />
      <div className="hidden sm:block">
        <PrototiposModule empresaId={DILESA_EMPRESA_ID} />
      </div>
    </RequireAccess>
  );
}
