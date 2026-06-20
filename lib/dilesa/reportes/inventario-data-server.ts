/**
 * Loader server-side de Inventario disponible para la ruta de PDF (ADR-047).
 * Espejo del fetch del hook con `createSupabaseServerClient` (RLS) + la misma
 * normalización pura. Solo lo importan route handlers.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  ESTADOS_DISPONIBLES,
  normalizarUnidades,
  UNIDADES_DISPONIBLES_SELECT,
  type UnidadDisponible,
  type UnidadRaw,
  type UnidadesBundle,
} from './inventario-data';

export async function cargarInventarioServer(): Promise<{
  unidades: UnidadDisponible[];
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
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
    return { unidades: [], error: firstErr.message };
  }

  return {
    unidades: normalizarUnidades({
      unidades: (unsRes.data ?? []) as UnidadRaw[],
      proyectos: (prjRes.data ?? []) as UnidadesBundle['proyectos'],
      productos: (prodRes.data ?? []) as UnidadesBundle['productos'],
    }),
  };
}
