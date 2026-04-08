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
    .schema('caja')
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
  const corteNombre = `${input.caja_nombre} — ${input.fecha_operativa}`;

  const { data: corte, error: insertErr } = await supabase
    .schema('caja')
    .from('cortes')
    .insert({
      caja_id: input.caja_id,
      caja_nombre: input.caja_nombre,
      corte_nombre: corteNombre,
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
