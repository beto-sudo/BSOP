'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export type RecetaInsumoInput = {
  insumo_id: string;
  cantidad: number;
  unidad: string;
};

export type UpsertRecetaInput = {
  producto_venta_id: string;
  insumos: RecetaInsumoInput[];
};

export type UpsertRecetaResult = { ok: true } | { ok: false; error: string };

export async function upsertReceta(input: UpsertRecetaInput): Promise<UpsertRecetaResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  for (const i of input.insumos) {
    if (!Number.isFinite(i.cantidad) || i.cantidad <= 0) {
      return { ok: false, error: 'Cantidad de receta inválida (debe ser > 0).' };
    }
    if (!i.insumo_id) {
      return { ok: false, error: 'Insumo sin id.' };
    }
    if (i.insumo_id === input.producto_venta_id) {
      return { ok: false, error: 'Un producto no puede ser insumo de sí mismo.' };
    }
  }

  const insumosIds = input.insumos.map((i) => i.insumo_id);
  if (insumosIds.length > 0) {
    const { data: validos, error: valErr } = await supabase
      .schema('erp')
      .from('productos')
      .select('id')
      .in('id', insumosIds)
      .eq('inventariable', true)
      .eq('empresa_id', RDB_EMPRESA_ID);
    if (valErr) return { ok: false, error: `Error validando insumos: ${valErr.message}` };
    if (!validos || validos.length !== insumosIds.length) {
      return {
        ok: false,
        error: 'Uno o más insumos no son inventariables o no pertenecen a RDB.',
      };
    }
  }

  const { error: delErr } = await supabase
    .schema('erp')
    .from('producto_receta')
    .delete()
    .eq('producto_venta_id', input.producto_venta_id);
  if (delErr) return { ok: false, error: `Error borrando receta previa: ${delErr.message}` };

  if (input.insumos.length > 0) {
    const { error: insErr } = await supabase
      .schema('erp')
      .from('producto_receta')
      .insert(
        input.insumos.map((i) => ({
          empresa_id: RDB_EMPRESA_ID,
          producto_venta_id: input.producto_venta_id,
          insumo_id: i.insumo_id,
          cantidad: i.cantidad,
          unidad: i.unidad,
        }))
      );
    if (insErr) return { ok: false, error: `Error guardando receta: ${insErr.message}` };
  }

  revalidatePath('/rdb/productos');
  return { ok: true };
}

export type UpdateCategoriaInput = {
  producto_id: string;
  categoria_id: string | null;
};

export type UpdateCategoriaResult = { ok: true } | { ok: false; error: string };

export async function updateCategoria(input: UpdateCategoriaInput): Promise<UpdateCategoriaResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  if (input.categoria_id) {
    const { data: cat, error: catErr } = await supabase
      .schema('erp')
      .from('categorias_producto')
      .select('id')
      .eq('id', input.categoria_id)
      .eq('empresa_id', RDB_EMPRESA_ID)
      .maybeSingle();
    if (catErr) return { ok: false, error: `Error validando categoría: ${catErr.message}` };
    if (!cat) return { ok: false, error: 'Categoría no pertenece a RDB.' };
  }

  const { error } = await supabase
    .schema('erp')
    .from('productos')
    .update({ categoria_id: input.categoria_id, updated_at: new Date().toISOString() })
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('id', input.producto_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/rdb/productos');
  return { ok: true };
}
