'use server';

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
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Auth error: ${error.message}`);
  }

  if (!user) throw new Error('No autenticado');
  return { supabase, user, userId: user.id };
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
  try {
    const { supabase, user } = await requireAuth();

    const folio = generarFolio('REQ');

    const sanitizedItems = items
      .map((item) => ({
        producto_id: item.producto_id ?? null,
        descripcion: item.descripcion?.trim() || '',
        cantidad: Number(item.cantidad ?? 0),
        unidad: item.unidad?.trim() || 'pza',
        notas: item.notas?.trim() || null,
      }))
      .filter((item) => item.descripcion.length > 0);

    if (sanitizedItems.length === 0) {
      throw new Error('No hay artículos válidos para guardar');
    }

    const { data: req, error: reqError } = await supabase
      .schema('rdb')
      .from('requisiciones')
      .insert({
        folio,
        estatus: 'enviada',
        solicitado_por: user.id,
        fecha_solicitud: new Date().toISOString(),
        notas: notas ?? null,
      })
      .select('id, folio')
      .single();

    if (reqError) throw new Error(`Error creando requisición: ${reqError.message}`);
    if (!req) throw new Error('Error al crear la requisición');

    const { error: itemsError } = await supabase
      .schema('rdb')
      .from('requisiciones_items')
      .insert(
        sanitizedItems.map((item) => ({
          requisicion_id: req.id,
          producto_id: item.producto_id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: item.unidad,
          notas: item.notas,
        })),
      );

    if (itemsError) throw new Error(`Error creando items: ${itemsError.message}`);

    return req as { id: string; folio: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido al guardar requisición';
    throw new Error(message);
  }
}

// ── Aprobar ───────────────────────────────────────────────────────────────────

export async function actualizarRequisicion(
  id: string,
  items: DraftItemInput[],
  notas?: string | null,
): Promise<void> {
  const { supabase } = await requireAuth();

  const sanitizedItems = items
    .map((item) => ({
      producto_id: item.producto_id ?? null,
      descripcion: item.descripcion?.trim() || '',
      cantidad: Number(item.cantidad ?? 0),
      unidad: item.unidad?.trim() || 'pza',
      notas: item.notas?.trim() || null,
    }))
    .filter((item) => item.descripcion.length > 0);

  if (sanitizedItems.length === 0) {
    throw new Error('No hay artículos válidos para guardar');
  }

  const { data: requisicion, error: requisicionError } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .select('estatus')
    .eq('id', id)
    .single();

  if (requisicionError) throw new Error(requisicionError.message);

  if (['aprobada', 'autorizada', 'convertida', 'convertida_oc', 'cancelada', 'rechazada'].includes(String(requisicion?.estatus ?? '').toLowerCase())) {
    throw new Error('La requisición ya no se puede editar');
  }

  const { error: updateReqError } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .update({ notas: notas ?? null })
    .eq('id', id);

  if (updateReqError) throw new Error(updateReqError.message);

  const { error: deleteItemsError } = await supabase
    .schema('rdb')
    .from('requisiciones_items')
    .delete()
    .eq('requisicion_id', id);

  if (deleteItemsError) throw new Error(deleteItemsError.message);

  const { error: insertItemsError } = await supabase
    .schema('rdb')
    .from('requisiciones_items')
    .insert(
      sanitizedItems.map((item) => ({
        requisicion_id: id,
        producto_id: item.producto_id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.unidad,
        notas: item.notas,
      })),
    );

  if (insertItemsError) throw new Error(insertItemsError.message);
}

export async function aprobarRequisicion(id: string): Promise<void> {
  const { supabase, user } = await requireAuth();

  const { error } = await supabase
    .schema('rdb')
    .from('requisiciones')
    .update({ estatus: 'aprobada', aprobado_por: user.id })
    .eq('id', id);

  if (error) throw new Error(error.message);
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
      estatus: 'abierta',
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
    .update({ estatus: 'convertida' })
    .eq('id', requisicionId);

  if (updateErr) throw new Error(updateErr.message);

  return oc as { id: string; folio: string };
}
