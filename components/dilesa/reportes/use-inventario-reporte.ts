'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Hook de datos para el reporte de Inventario disponible (ADR-047). Mismo criterio
 * de "vendible hoy" que el módulo Inventario + el precio DESGLOSADO por unidad
 * (RPC `fn_calcular_precio_venta`, concurrencia limitada como en inventario-module).
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  ESTADOS_DISPONIBLES,
  normalizarUnidades,
  parsePrecioDesglose,
  PRECIO_VACIO,
  UNIDADES_DISPONIBLES_SELECT,
  type PrecioDesglose,
  type UnidadDetalle,
  type UnidadRaw,
  type UnidadesBundle,
} from '@/lib/dilesa/reportes/inventario-data';

const CONC = 8;

export function useInventarioReporte() {
  const [unidades, setUnidades] = useState<UnidadDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [unsRes, prjRes, prodRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select(UNIDADES_DISPONIBLES_SELECT)
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .is('activo_id', null)
        .eq('es_muestra', false)
        .in('estado', [...ESTADOS_DISPONIBLES]),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
    ]);

    const firstErr = unsRes.error ?? prjRes.error ?? prodRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el inventario.'));
      setUnidades([]);
      setLoading(false);
      return;
    }

    const unidadesRaw = (unsRes.data ?? []) as UnidadRaw[];
    const precios = new Map<string, PrecioDesglose>();
    for (let i = 0; i < unidadesRaw.length; i += CONC) {
      const chunk = unidadesRaw.slice(i, i + CONC);
      await Promise.all(
        chunk.map(async (u) => {
          const { data, error: rpcErr } = await sb
            .schema('dilesa')
            .rpc('fn_calcular_precio_venta', { p_unidad_id: u.id });
          precios.set(u.id, rpcErr || !data ? PRECIO_VACIO : parsePrecioDesglose(data));
        })
      );
    }

    setUnidades(
      normalizarUnidades({
        unidades: unidadesRaw,
        proyectos: (prjRes.data ?? []) as UnidadesBundle['proyectos'],
        productos: (prodRes.data ?? []) as UnidadesBundle['productos'],
        precios,
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { unidades, loading, error, recargar };
}
