'use client';

import { useParams } from 'next/navigation';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { CosteoModule } from '@/components/dilesa/costeo-module';
import { GastoActividad } from '@/components/dilesa/gasto-actividad';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * @module Proyectos · Gasto (DILESA)
 * @responsive desktop-only
 *
 * Tab "Gasto" del detalle de proyecto — el home del control presupuestal
 * (iniciativa `dilesa-flujo-gasto` · Sprint 2). Es el Costeo (3 capas de
 * `erp.v_partida_control` + contratado de obra) MUDADO desde
 * Construcción › Costeo (decisión D1: una sola superficie, anclada en el
 * proyecto), con el proyecto fijo y la actividad reciente del gasto.
 *
 * Gate: sub-slug `dilesa.proyectos.gasto` (ADR-030 SS5; permisos clonados de
 * `dilesa.construccion.costeo` en la migración 20260609230203).
 */
export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.gasto">
      <DesktopOnlyNotice module="Gasto del proyecto" />
      <div className="hidden sm:block">
        <Body />
      </div>
    </RequireAccess>
  );
}

function Body() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div>
      <CosteoModule empresaId={DILESA_EMPRESA_ID} proyectoIdFijo={id} />
      <div className="px-6 pb-6">
        <GastoActividad proyectoId={id} />
      </div>
    </div>
  );
}
