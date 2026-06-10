'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ProyectoDetallePageBody } from '@/components/dilesa/proyecto-detalle-page-body';

/**
 * @module Proyectos · Detalle · Resumen (DILESA)
 * @responsive desktop-only
 *
 * Tab default del detalle de proyecto. Desde fase 3 de `dilesa-flujo-gasto`
 * el detalle es un hub con tabs (Resumen / Unidades / Obras / Checklist /
 * Gasto) y banda de contexto permanente en el layout; este tab concentra
 * identidad + avances + plano + "Editar parámetros" (solo Dirección).
 *
 * El sub-slug RBAC es `dilesa.proyectos.activos` (el detalle pertenece a la
 * misma tab del listado). Anteproyectos tienen su propia ruta.
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.activos">
      <DesktopOnlyNotice module="Proyecto" />
      <div className="hidden sm:block">
        <ProyectoDetallePageBody seccion="resumen" />
      </div>
    </RequireAccess>
  );
}
