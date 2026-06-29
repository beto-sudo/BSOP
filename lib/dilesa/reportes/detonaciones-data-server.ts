/**
 * Loader server-side de DEPÓSITOS DILESA para las rutas de PDF/CSV del reporte
 * de detonaciones (ADR-047). Espejo del fetch del hook del browser, con
 * `createSupabaseServerClient` (sesión + RLS empresa-scoped) y la misma
 * normalización pura. Solo lo importan route handlers (server).
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  normalizarDepositos,
  DEPOSITOS_SELECT,
  VENTAS_DEPOSITO_SELECT,
  type DepositoRaw,
  type DepositoReporteRow,
  type DepositosRawBundle,
  type VentaDepositoRaw,
} from './detonaciones-data';

export async function cargarDepositosServer(): Promise<{
  depositos: DepositoReporteRow[];
  proyectoNombre: Map<string, string>;
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
  const [depRes, ventasRes, unidadesRes, prjRes, personasRes, cuentasRes] = await Promise.all([
    sb
      .schema('erp')
      .from('cxc_pagos')
      .select(DEPOSITOS_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('origen_tipo', 'venta_dilesa')
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('ventas')
      .select(VENTAS_DEPOSITO_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('unidades')
      .select('id, identificador, proyecto_id')
      .eq('empresa_id', DILESA_EMPRESA_ID),
    sb
      .schema('dilesa')
      .from('proyectos')
      .select('id, nombre')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
    sb
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('tipo', 'cliente'),
    sb
      .schema('erp')
      .from('cuentas_bancarias')
      .select('id, nombre')
      .eq('empresa_id', DILESA_EMPRESA_ID),
  ]);

  const firstErr =
    depRes.error ??
    ventasRes.error ??
    unidadesRes.error ??
    prjRes.error ??
    personasRes.error ??
    cuentasRes.error;
  if (firstErr) {
    return { depositos: [], proyectoNombre: new Map(), error: firstErr.message };
  }

  const proyectos = (prjRes.data ?? []) as Array<{ id: string; nombre: string }>;
  return {
    depositos: normalizarDepositos({
      depositos: (depRes.data ?? []) as DepositoRaw[],
      ventas: (ventasRes.data ?? []) as VentaDepositoRaw[],
      unidades: (unidadesRes.data ?? []) as DepositosRawBundle['unidades'],
      proyectos,
      personas: (personasRes.data ?? []) as DepositosRawBundle['personas'],
      cuentas: (cuentasRes.data ?? []) as DepositosRawBundle['cuentas'],
    }),
    proyectoNombre: new Map(proyectos.map((p) => [p.id, p.nombre])),
  };
}
