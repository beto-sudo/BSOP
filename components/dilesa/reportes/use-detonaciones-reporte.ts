'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. use-ventas-reporte.ts).
 */

/**
 * Hook de datos para el reporte de Detonaciones / Depósitos (ADR-047). Fetch en
 * el browser (queries con `.eq(empresa_id)` para evitar URLs > 8KB) +
 * normalización compartida (`normalizarDepositos`), con estado de carga/error y
 * refetch. Espejo de `use-ventas-reporte` adaptado a `erp.cxc_pagos`.
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  normalizarDepositos,
  DEPOSITOS_SELECT,
  VENTAS_DEPOSITO_SELECT,
  type DepositoRaw,
  type DepositoReporteRow,
  type DepositosRawBundle,
  type VentaDepositoRaw,
} from '@/lib/dilesa/reportes/detonaciones-data';

export function useDetonacionesReporte() {
  const [depositos, setDepositos] = useState<DepositoReporteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
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
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el reporte.'));
      setDepositos([]);
      setLoading(false);
      return;
    }

    setDepositos(
      normalizarDepositos({
        depositos: (depRes.data ?? []) as DepositoRaw[],
        ventas: (ventasRes.data ?? []) as VentaDepositoRaw[],
        unidades: (unidadesRes.data ?? []) as DepositosRawBundle['unidades'],
        proyectos: (prjRes.data ?? []) as DepositosRawBundle['proyectos'],
        personas: (personasRes.data ?? []) as DepositosRawBundle['personas'],
        cuentas: (cuentasRes.data ?? []) as DepositosRawBundle['cuentas'],
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { depositos, loading, error, recargar };
}
