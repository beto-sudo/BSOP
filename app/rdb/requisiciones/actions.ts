'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type DraftItemInput = {
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  unidad: string;
  notas?: string | null;
};

function generarFolio(prefix: string): string {
  const now = new Date();
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${d}-${suffix}`;
}

async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('No autenticado');
  return { supabase, user: session.user, userId: session.user.id };
}

async function resolveUserDisplayName(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
) {
  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : '';

  if (fullName) return fullName;
  if (name) return name;
  if (firstName) return firstName;

  const { data: profile } = await supabase
    .schema('core')
    .from('usuarios')
    .select('first_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const profileFirstName = profile?.first_name?.trim() || '';
  if (profileFirstName) return profileFirstName;

  return user.email?.split('@')[0] || profile?.email?.split('@')[0] || 'Sistema';
}

// ── Guardar (create as pendiente) ─────────────────────────────────────────────

export async function guardarRequisicion(
  items: DraftItemInput[],
  notas?: string | null,
): Promise<{ id: string; folio: string }> {
  const { supabase, user } = await requireAuth();
  const solicitadoPor = await resolveUserDisplayName(supabase, user);

  const folio = generarFolio('REQ');

  const { data: req, error: reqError } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .insert({
      folio,
      estatus: 'pendiente',
      solicitado_por: solicitadoPor,
      fecha_solicitud: new Date().toISOString(),
      notas: notas ?? null,
    })
    .select('id, folio')
    .single();

  if (reqError) throw new Error(reqError.message);
  if (!req) throw new Error('Error al crear la requisición');

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .schema('rdb')
      .from('requisiciones_items')
      .insert(
        items.map((item) => ({
          requisicion_id: req.id,
          producto_id: item.producto_id ?? null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: item.unidad || 'pza',
          notas: item.notas ?? null,
        })),
      );

    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath('/rdb/requisiciones');
  return req as { id: string; folio: string };
}

// ── Aprobar ───────────────────────────────────────────────────────────────────

export async function aprobarRequisicion(id: string): Promise<void> {
  const { supabase, user } = await requireAuth();
  const aprobadoPor = await resolveUserDisplayName(supabase, user);

  const { error } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .update({ estatus: 'autorizada', aprobado_por: aprobadoPor })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/rdb/requisiciones');
}

// ── Generar Orden de Compra ────────────────────────────────────────────────────

export async function generarOrdenCompra(
  requisicionId: string,
): Promise<{ id: string; folio: string }> {
  const { supabase } = await requireAuth();

  // Load requisicion items
  const { data: reqItems, error: itemsErr } = await supabase
    .schema('rdb')
    .from('requisiciones_items')
    .select('*')
    .eq('requisicion_id', requisicionId);

  if (itemsErr) throw new Error(itemsErr.message);

  const folio = generarFolio('OC');

  // Create orden de compra
  const { data: oc, error: ocErr } = await supabase
    .schema('rdb')
    .from('ordenes_compra')
    .insert({
      folio,
      requisicion_id: requisicionId,
      proveedor_id: null,
      estatus: 'pendiente',
      fecha_emision: new Date().toISOString(),
    })
    .select('id, folio')
    .single();

  if (ocErr) throw new Error(ocErr.message);
  if (!oc) throw new Error('Error al crear la orden de compra');

  // Copy items
  if (reqItems && reqItems.length > 0) {
    const { error: ocItemsErr } = await supabase
      .schema('rdb')
      .from('ordenes_compra_items')
      .insert(
        reqItems.map((item: Record<string, unknown>) => ({
          orden_id: oc.id,
          producto_id: item.producto_id ?? null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          cantidad_recibida: 0,
          precio_unitario: 0,
          subtotal: 0,
        })),
      );

    if (ocItemsErr) throw new Error(ocItemsErr.message);
  }

  // Update requisicion status
  const { error: updateErr } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .update({ estatus: 'convertida_oc' })
    .eq('id', requisicionId);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath('/rdb/requisiciones');
  return oc as { id: string; folio: string };
}
