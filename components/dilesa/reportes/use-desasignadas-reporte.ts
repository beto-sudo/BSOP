'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA.
 */

/**
 * Hook de datos para el reporte de Ventas desasignadas (ADR-047). Fetch enfocado
 * a `estado='desasignada'` (~119 filas) + catálogos para resolver cliente/unidad/
 * vendedor, con la normalización pura compartida.
 */
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  DESASIGNADAS_SELECT,
  normalizarDesasignadas,
  type DesasignadaRaw,
  type DesasignadaRow,
  type DesasignadasBundle,
} from '@/lib/dilesa/reportes/desasignadas-data';

export function useDesasignadasReporte() {
  const [filas, setFilas] = useState<DesasignadaRow[]>([]);
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
        .select(DESASIGNADAS_SELECT)
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .eq('estado', 'desasignada'),
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
      setFilas([]);
      setLoading(false);
      return;
    }

    const ventasRaw = (ventasRes.data ?? []) as DesasignadaRaw[];
    const vendedorIds = [
      ...new Set(ventasRaw.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    let usuarios: DesasignadasBundle['usuarios'] = [];
    if (vendedorIds.length > 0) {
      const { data } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);
      usuarios = (data ?? []) as DesasignadasBundle['usuarios'];
    }

    setFilas(
      normalizarDesasignadas({
        ventas: ventasRaw,
        unidades: (unidadesRes.data ?? []) as DesasignadasBundle['unidades'],
        proyectos: (prjRes.data ?? []) as DesasignadasBundle['proyectos'],
        personas: (personasRes.data ?? []) as DesasignadasBundle['personas'],
        usuarios,
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { filas, loading, error, recargar };
}
