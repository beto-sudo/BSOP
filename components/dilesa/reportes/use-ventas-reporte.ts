'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. app/dilesa/ventas/fases/page.tsx).
 */

/**
 * Hook de datos para los reportes de Ventas (ADR-047). Fetch en el browser
 * (5 queries con `.eq(empresa_id)` para evitar URLs > 8KB) + normalización
 * compartida (`normalizarVentas`), con estado de carga/error y refetch. Lo
 * comparten las vistas que parten del mismo dataset de ventas.
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  normalizarVentas,
  VENTAS_SELECT,
  type VentaRaw,
  type VentaReporteRow,
  type VentasRawBundle,
} from '@/lib/dilesa/reportes/ventas-data';

export function useVentasReporte() {
  const [ventas, setVentas] = useState<VentaReporteRow[]>([]);
  const [proyectos, setProyectos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const [ventasRes, unidadesRes, prjRes, personasRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ventas')
        .select(VENTAS_SELECT)
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

    const firstErr = ventasRes.error ?? unidadesRes.error ?? prjRes.error ?? personasRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudo cargar el reporte.'));
      setVentas([]);
      setLoading(false);
      return;
    }

    const ventasRaw = (ventasRes.data ?? []) as VentaRaw[];
    const vendedorIds = [
      ...new Set(ventasRaw.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    let usuarios: VentasRawBundle['usuarios'] = [];
    if (vendedorIds.length > 0) {
      const { data } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);
      usuarios = (data ?? []) as VentasRawBundle['usuarios'];
    }

    const proyectosArr = (prjRes.data ?? []) as Array<{ id: string; nombre: string }>;
    setProyectos(proyectosArr);
    setVentas(
      normalizarVentas({
        ventas: ventasRaw,
        unidades: (unidadesRes.data ?? []) as VentasRawBundle['unidades'],
        proyectos: proyectosArr,
        personas: (personasRes.data ?? []) as VentasRawBundle['personas'],
        usuarios,
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { ventas, proyectos, loading, error, recargar };
}
