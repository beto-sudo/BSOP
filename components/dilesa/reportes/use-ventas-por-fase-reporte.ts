'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. use-detonaciones-reporte.ts).
 */

/**
 * Hook de datos para el reporte «Ventas por fase» (ADR-047). Fetch en el
 * browser (queries con `.eq(empresa_id)` para evitar URLs > 8KB) +
 * normalización compartida (`normalizarVentasPorFase`), con estado de
 * carga/error y refetch. Espejo de `use-detonaciones-reporte` adaptado a
 * `dilesa.venta_fases`.
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  normalizarVentasPorFase,
  VENTA_FASES_SELECT,
  VENTAS_FASE_SELECT,
  type VentaFaseRaw,
  type VentaFaseReporteRow,
  type VentasPorFaseRawBundle,
  type VentaFaseVentaRaw,
} from '@/lib/dilesa/reportes/ventas-por-fase-data';

export function useVentasPorFaseReporte() {
  const [filas, setFilas] = useState<VentaFaseReporteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [fasesRes, ventasRes, unidadesRes, prjRes, personasRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('venta_fases')
        .select(VENTA_FASES_SELECT)
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('ventas')
        .select(VENTAS_FASE_SELECT)
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
    ]);

    const firstErr =
      fasesRes.error ?? ventasRes.error ?? unidadesRes.error ?? prjRes.error ?? personasRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el reporte.'));
      setFilas([]);
      setLoading(false);
      return;
    }

    setFilas(
      normalizarVentasPorFase({
        fases: (fasesRes.data ?? []) as VentaFaseRaw[],
        ventas: (ventasRes.data ?? []) as VentaFaseVentaRaw[],
        unidades: (unidadesRes.data ?? []) as VentasPorFaseRawBundle['unidades'],
        proyectos: (prjRes.data ?? []) as VentasPorFaseRawBundle['proyectos'],
        personas: (personasRes.data ?? []) as VentasPorFaseRawBundle['personas'],
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { filas, loading, error, recargar };
}
