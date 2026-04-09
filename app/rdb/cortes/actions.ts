'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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
    .schema('rdb')
    .from('cortes')
    .select('id')
    .eq('caja_id', input.caja_id)
    .ilike('estado', 'abierto')
    .maybeSingle();

  if (checkErr) throw new Error(checkErr.message);

  if (existing) {
    throw new Error(
      'Ya existe un turno abierto para esta caja. Ciérralo antes de abrir uno nuevo.',
    );
  }

  const now = new Date().toISOString();

  const { data: corte, error: insertErr } = await supabase
    .schema('rdb')
    .from('cortes')
    .insert({
      caja_id: input.caja_id,
      caja_nombre: input.caja_nombre,
      estado: 'Abierto',
      responsable_apertura: input.responsable_apertura,
      efectivo_inicial: input.efectivo_inicial,
      fecha_operativa: input.fecha_operativa,
      hora_inicio: now,
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
    .schema('rdb')
    .from('cortes')
    .update({
      estado: 'cerrado',
      hora_fin: now,
      efectivo_contado,
      observaciones: input.observaciones ?? null,
    })
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
      .schema('rdb')
      .from('corte_conteo_denominaciones')
      .upsert(rows, { onConflict: 'corte_id,denominacion' });
    if (denomErr) throw new Error(denomErr.message);
  }

  revalidatePath('/rdb/cortes');
}
