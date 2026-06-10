'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProyectoDetallePageBody } from '@/components/dilesa/proyecto-detalle-page-body';

/**
 * @module Proyectos · Detalle · unidades (DILESA)
 * @responsive desktop-only
 *
 * Tab "unidades" del detalle de proyecto (fase 3 dilesa-flujo-gasto: el
 * scroll-largo se repartió en tabs). Gobernado por el sub-slug del listado
 * (dilesa.proyectos.activos) — mismo dominio funcional; solo Gasto tiene
 * sub-slug propio.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.activos">
      <DesktopOnlyNotice module="Proyecto" />
      <div className="hidden sm:block">
        <ProyectoDetallePageBody seccion="unidades" />
      </div>
    </RequireAccess>
  );
}
