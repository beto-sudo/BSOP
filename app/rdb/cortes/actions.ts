'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

export type AbrirCajaInput = {
  caja_id: string;
  caja_nombre: string;
  responsable_apertura: string;
  efectivo_inicial: number;
  fecha_operativa: string; // YYYY-MM-DD
};

export async function abrirCaja(input: AbrirCajaInput): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // Check for an existing open turn on this caja (case-insensitive)
  const { data: existing, error: checkErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .select('id')
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('caja_nombre', input.caja_nombre)
    .eq('estado', 'abierto')
    .maybeSingle();

  if (checkErr) throw new Error(checkErr.message);

  if (existing) {
    throw new Error(
      'Ya existe un turno abierto para esta caja. Ciérralo antes de abrir uno nuevo.',
    );
  }

  const now = new Date().toISOString();

  const { data: corte, error: insertErr } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .insert({
      empresa_id: RDB_EMPRESA_ID,
      caja_nombre: input.caja_nombre,
      estado: 'abierto',
      efectivo_inicial: input.efectivo_inicial,
      fecha_operativa: input.fecha_operativa,
      abierto_at: now,
      observaciones: input.responsable_apertura,
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  if (!corte) throw new Error('Error al abrir el turno de caja');

  revalidatePath('/rdb/cortes');
  return corte as { id: string };
}

export type Denominacion = {
  denominacion: number;
  tipo: 'billete' | 'moneda';
  cantidad: number;
};

export type CerrarCajaInput = {
  corte_id: string;
  denominaciones: Denominacion[];
  observaciones?: string;
};

export async function cerrarCaja(input: CerrarCajaInput): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');

  // Calcular total desde denominaciones
  const efectivo_contado = input.denominaciones.reduce(
    (sum, d) => sum + d.denominacion * d.cantidad,
    0
  );

  const now = new Date().toISOString();

  // Actualizar corte
  const { error } = await supabase
    .schema('erp')
    .from('cortes_caja')
    .update({
      estado: 'cerrado',
      cerrado_at: now,
      efectivo_contado,
      observaciones: input.observaciones ?? null,
      updated_at: now,
    })
    .eq('empresa_id', RDB_EMPRESA_ID)
    .eq('id', input.corte_id);

  if (error) throw new Error(error.message);

  // Guardar denominaciones (solo las que tienen cantidad > 0)
  const rows = input.denominaciones
    .filter((d) => d.cantidad > 0)
    .map((d) => ({
      corte_id: input.corte_id,
      denominacion: d.denominacion,
      tipo: d.tipo,
      cantidad: d.cantidad,
    }));

  if (rows.length > 0) {
    const { error: denomErr } = await supabase
      .schema('erp')
      .from('corte_conteo_denominaciones')
      .upsert(rows.map((r) => ({ ...r, empresa_id: RDB_EMPRESA_ID })), { onConflict: 'corte_id,denominacion' });
    if (denomErr) throw new Error(denomErr.message);
  }

  revalidatePath('/rdb/cortes');
}
