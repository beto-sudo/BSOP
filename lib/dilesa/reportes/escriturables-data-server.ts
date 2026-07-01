/**
 * Loader server-side de Unidades escriturables para la ruta de PDF (ADR-047).
 * Espejo del fetch del hook (`use-escriturables-reporte`). Solo lo importan
 * route handlers.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  normalizarEscriturables,
  OBRAS_SELECT,
  UNIDADES_ESCRITURABLES_SELECT,
  VENTAS_CANDIDATAS_SELECT,
  type EscriturablesBundle,
  type ObraRaw,
  type UnidadEscriturableRaw,
  type UnidadEscriturableRow,
  type VentaCandidataRaw,
} from './escriturables-data';

export async function cargarEscriturablesServer(): Promise<{
  unidades: UnidadEscriturableRow[];
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
  const [unsRes, ventasRes, obrasRes, prjRes, prodRes, personasRes] = await Promise.all([
    sb
      .schema('dilesa')
      .from('unidades')
      .select(UNIDADES_ESCRITURABLES_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .eq('es_muestra', false),
    sb
      .schema('dilesa')
      .from('ventas')
      .select(VENTAS_CANDIDATAS_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .eq('estado', 'activa')
      .is('numero_escritura', null),
    sb
      .schema('dilesa')
      .from('construccion')
      .select(OBRAS_SELECT)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null),
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
    sb
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('tipo', 'cliente'),
  ]);

  const firstErr =
    unsRes.error ??
    ventasRes.error ??
    obrasRes.error ??
    prjRes.error ??
    prodRes.error ??
    personasRes.error;
  if (firstErr) {
    return { unidades: [], error: firstErr.message };
  }

  const clientes = new Map<string, string>();
  for (const p of personasRes.data ?? []) {
    const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
    clientes.set(p.id as string, nombre || '(sin nombre)');
  }

  return {
    unidades: normalizarEscriturables({
      unidades: (unsRes.data ?? []) as UnidadEscriturableRaw[],
      ventas: (ventasRes.data ?? []) as VentaCandidataRaw[],
      obras: (obrasRes.data ?? []) as ObraRaw[],
      proyectos: (prjRes.data ?? []) as EscriturablesBundle['proyectos'],
      productos: (prodRes.data ?? []) as EscriturablesBundle['productos'],
      clientes,
    }),
  };
}
