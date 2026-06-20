/**
 * Loader server-side de Ventas estancadas para la ruta de PDF (ADR-047).
 * Lee la vista `dilesa.v_ventas_pipeline_antiguedad` con la sesión del usuario
 * (RLS) + resuelve el vendedor. Solo lo importan route handlers.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  normalizarEstancadas,
  type EstancadaRaw,
  type EstancadaRow,
  type EstancadasBundle,
} from './estancadas-data';

export async function cargarEstancadasServer(): Promise<{
  filas: EstancadaRow[];
  error?: string;
}> {
  const sb = await createSupabaseServerClient();
  const { data, error: vErr } = await sb
    .schema('dilesa')
    .from('v_ventas_pipeline_antiguedad')
    .select(
      'venta_id, fase_actual, fase_posicion, fecha_fase_actual, dias_en_fase, unidad_identificador, proyecto_id, proyecto_nombre, cliente, vendedor, vendedor_usuario_id, precio'
    )
    .eq('empresa_id', DILESA_EMPRESA_ID);

  if (vErr) {
    return { filas: [], error: vErr.message };
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

  return { filas: normalizarEstancadas({ filas: raw, usuarios }) };
}
