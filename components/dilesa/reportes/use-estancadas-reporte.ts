'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Hook de datos para el reporte de Ventas estancadas (ADR-047). Lee la vista
 * `dilesa.v_ventas_pipeline_antiguedad` (días en fase calculados en la base) +
 * resuelve el nombre del vendedor (core.usuarios es self-only).
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  normalizarEstancadas,
  type EstancadaRaw,
  type EstancadaRow,
  type EstancadasBundle,
} from '@/lib/dilesa/reportes/estancadas-data';

export function useEstancadasReporte() {
  const [filas, setFilas] = useState<EstancadaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const { data, error: vErr } = await sb
      .schema('dilesa')
      .from('v_ventas_pipeline_antiguedad')
      .select(
        'venta_id, fase_actual, fase_posicion, fecha_fase_actual, dias_en_fase, unidad_identificador, proyecto_id, proyecto_nombre, cliente, vendedor, vendedor_usuario_id, precio'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID);

    if (vErr) {
      setError(getSupabaseErrorMessage(vErr, 'No se pudo cargar el reporte.'));
      setFilas([]);
      setLoading(false);
      return;
    }

    const raw = (data ?? []) as unknown as EstancadaRaw[];
    const vendedorIds = [
      ...new Set(raw.map((r) => r.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    let usuarios: EstancadasBundle['usuarios'] = [];
    if (vendedorIds.length > 0) {
      const { data: us } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);
      usuarios = (us ?? []) as EstancadasBundle['usuarios'];
    }

    setFilas(normalizarEstancadas({ filas: raw, usuarios }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { filas, loading, error, recargar };
}
