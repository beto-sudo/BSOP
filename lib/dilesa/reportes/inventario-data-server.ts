/**
 * Loader server-side de Inventario disponible para la ruta de PDF (ADR-047).
 * Espejo del fetch del hook: unidades vendibles + precio desglosado por unidad
 * (RPC `fn_calcular_precio_venta`). Solo lo importan route handlers.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
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
} from './inventario-data';

const CONC = 8;

export async function cargarInventarioServer(): Promise<{
  unidades: UnidadDetalle[];
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

  return {
    unidades: normalizarUnidades({
      unidades: unidadesRaw,
      proyectos: (prjRes.data ?? []) as UnidadesBundle['proyectos'],
      productos: (prodRes.data ?? []) as UnidadesBundle['productos'],
      precios,
    }),
  };
}
