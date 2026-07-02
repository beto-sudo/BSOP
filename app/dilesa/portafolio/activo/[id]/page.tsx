'use client';

/**
 * @module Portafolio · Expediente de activo (DILESA)
 * @responsive desktop-only
 *
 * Página completa del expediente de un activo (iniciativa
 * `dilesa-portafolio-predios` · S2, reemplaza al side drawer). Vive fuera
 * del route group `(hub)` para no heredar los tabs del hub. Comparte el
 * sub-slug `dilesa.portafolio.inventario` (es el drill-down de la lista).
 */

import { use } from 'react';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ActivoExpediente } from '@/components/dilesa/activo-expediente';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.portafolio.inventario">
      <DesktopOnlyNotice module="Portafolio" />
      <div className="hidden sm:block">
        <ActivoExpediente activoId={id} />
      </div>
    </RequireAccess>
  );
}
