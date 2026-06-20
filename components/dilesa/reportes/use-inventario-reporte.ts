'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Hook de datos para el reporte de Inventario disponible (ADR-047). Mismo
 * criterio de "vendible hoy" que el módulo Inventario (estado disponible,
 * no liberada al portafolio, no muestra).
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  ESTADOS_DISPONIBLES,
  normalizarUnidades,
  UNIDADES_DISPONIBLES_SELECT,
  type UnidadDisponible,
  type UnidadRaw,
  type UnidadesBundle,
} from '@/lib/dilesa/reportes/inventario-data';

export function useInventarioReporte() {
  const [unidades, setUnidades] = useState<UnidadDisponible[]>([]);
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

    setUnidades(
      normalizarUnidades({
        unidades: (unsRes.data ?? []) as UnidadRaw[],
        proyectos: (prjRes.data ?? []) as UnidadesBundle['proyectos'],
        productos: (prodRes.data ?? []) as UnidadesBundle['productos'],
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { unidades, loading, error, recargar };
}
