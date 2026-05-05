'use server';

import { revalidatePath } from 'next/cache';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { isCanchaProduct } from '@/lib/playtomic/conciliacion';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type AssignPaymentInput = {
  booking_id: string;
  waitry_order_id: string;
  assigned_amount: number;
  note?: string | null;
};

export type AssignPaymentResult = { ok: true; id: string } | { ok: false; error: string };
export type UnassignPaymentResult = { ok: true } | { ok: false; error: string };

function revalidateConciliacion() {
  revalidatePath('/rdb/playtomic/conciliacion');
  revalidatePath('/rdb/playtomic');
}

export async function assignPaymentAction(input: AssignPaymentInput): Promise<AssignPaymentResult> {
  await assertNotInPreview();

  const bookingId = input.booking_id?.trim();
  const waitryOrderId = input.waitry_order_id?.trim();
  const assignedAmount = Number(input.assigned_amount);
  const note = typeof input.note === 'string' && input.note.trim().length > 0 ? input.note : null;

  if (!bookingId) return { ok: false, error: 'booking_id requerido' };
  if (!waitryOrderId) return { ok: false, error: 'waitry_order_id requerido' };
  if (!Number.isFinite(assignedAmount) || assignedAmount <= 0) {
    return { ok: false, error: 'El monto asignado debe ser mayor que 0.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };

  const playtomic = supabase.schema('playtomic');
  const rdb = supabase.schema('rdb');

  const { data: booking, error: bookingErr } = await playtomic
    .from('bookings')
    .select('booking_id,is_canceled')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (bookingErr) return { ok: false, error: `Error consultando reserva: ${bookingErr.message}` };
  if (!booking) return { ok: false, error: 'La reserva no existe.' };
  if (booking.is_canceled) {
    return { ok: false, error: 'La reserva está cancelada — no se puede asignar pago.' };
  }

  const { data: pedido, error: pedidoErr } = await rdb
    .from('waitry_pedidos')
    .select('order_id,paid')
    .eq('order_id', waitryOrderId)
    .maybeSingle();
  if (pedidoErr) return { ok: false, error: `Error consultando pedido: ${pedidoErr.message}` };
  if (!pedido) return { ok: false, error: 'El pedido Waitry no existe.' };
  if (!pedido.paid) {
    return { ok: false, error: 'El pedido Waitry no está marcado como pagado.' };
  }

  const { data: productos, error: productosErr } = await rdb
    .from('waitry_productos')
    .select('product_name')
    .eq('order_id', waitryOrderId);
  if (productosErr) {
    return { ok: false, error: `Error consultando productos: ${productosErr.message}` };
  }
  const hasCanchaProduct = (productos ?? []).some((p) => isCanchaProduct(p.product_name));
  if (!hasCanchaProduct) {
    return {
      ok: false,
      error:
        'El pedido Waitry no contiene un producto de cancha (padel/tenis/pickleball/coach) — no es elegible.',
    };
  }

  const { data: inserted, error: insertErr } = await playtomic
    .from('payment_assignments')
    .insert({
      booking_id: bookingId,
      waitry_order_id: waitryOrderId,
      assigned_amount: assignedAmount,
      assigned_by: user.id,
      note,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return { ok: false, error: 'Este pedido Waitry ya está asignado a otra reserva.' };
    }
    return { ok: false, error: `Error al guardar la asignación: ${insertErr.message}` };
  }

  revalidateConciliacion();
  return { ok: true, id: inserted.id };
}

export async function unassignPaymentAction(assignmentId: string): Promise<UnassignPaymentResult> {
  await assertNotInPreview();

  const id = assignmentId?.trim();
  if (!id) return { ok: false, error: 'assignmentId requerido' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };

  const { error } = await supabase
    .schema('playtomic')
    .from('payment_assignments')
    .delete()
    .eq('id', id);

  if (error) {
    return { ok: false, error: `Error al quitar la asignación: ${error.message}` };
  }

  revalidateConciliacion();
  return { ok: true };
}
