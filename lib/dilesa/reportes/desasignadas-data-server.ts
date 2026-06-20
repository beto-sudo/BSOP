/**
 * Loader server-side de ventas desasignadas para la ruta de PDF (ADR-047).
 * Espejo del fetch del hook con `createSupabaseServerClient` (RLS) + la misma
 * normalización pura. Solo lo importan route handlers.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  DESASIGNADAS_SELECT,
  normalizarDesasignadas,
  type DesasignadaRaw,
  type DesasignadaRow,
  type DesasignadasBundle,
} from './desasignadas-data';

export async function cargarDesasignadasServer(): Promise<{
  filas: DesasignadaRow[];
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
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
    return { filas: [], error: firstErr.message };
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

  return {
    filas: normalizarDesasignadas({
      ventas: ventasRaw,
      unidades: (unidadesRes.data ?? []) as DesasignadasBundle['unidades'],
      proyectos: (prjRes.data ?? []) as DesasignadasBundle['proyectos'],
      personas: (personasRes.data ?? []) as DesasignadasBundle['personas'],
      usuarios,
    }),
  };
}
