/**
 * POST /api/dilesa/ventas/[id]/notify-hold-creado
 *
 * Envía el email "Bienvenido a DILESA — Tu solicitud por X" inmediato
 * cuando se crea una solicitud nueva desde el form de `/dilesa/ventas/nueva`.
 *
 * Por qué este endpoint en lugar del cron:
 * - El cron corre cada hora, lo que hace que el vendedor + cliente esperen
 *   hasta 60 min entre el submit y el email. Beto pidió que sea instantáneo.
 * - El cron sigue activo como SAFETY NET: si este endpoint falla (Resend
 *   caído, network glitch), el cron levanta el email en su siguiente vuelta
 *   porque la idempotencia vive en `dilesa.ventas.notif_hold_creado_at`.
 *
 * Idempotencia: si `notif_hold_creado_at IS NOT NULL` no se manda de nuevo.
 *
 * Security: requiere sesión Supabase válida. NO usa CRON_SECRET. La RLS de
 * `dilesa.ventas` garantiza que solo el vendedor de esa venta (o admin) puede
 * verla — si la RLS deja leer la venta, deja mandar el email.
 *
 * Falla: NO bloquea la creación de la venta. El form llama este endpoint
 * fire-and-forget; aunque falle, la venta ya quedó persistida y el cron
 * la recoge después.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { sendHoldEmail, type HoldEmailContext } from '@/lib/dilesa/hold-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VentaRow {
  id: string;
  empresa_id: string;
  unidad_id: string | null;
  persona_id: string;
  vendedor_usuario_id: string | null;
  vendedor: string | null;
  expira_at: string | null;
  notif_hold_creado_at: string | null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Auth: requiere sesión válida — la RLS hace el resto.
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Leer venta con RLS del usuario (no admin) — si no la puede ver,
  // tampoco puede mandar email a su nombre.
  const { data: v, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, expira_at, notif_hold_creado_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (vErr || !v) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }
  const venta = v as unknown as VentaRow;

  // Idempotencia: ya se mandó.
  if (venta.notif_hold_creado_at) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  // Para los lookups cross-schema (persona, usuario, unidad, proyecto) usamos
  // el cliente admin para no depender de que el vendedor tenga RLS de lectura
  // sobre core.usuarios o erp.personas — esto es solo lectura para componer
  // el email, no expone secrets al cliente.
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const [{ data: persona }, { data: usuario }, { data: unidad }] = await Promise.all([
    admin
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno, email')
      .eq('id', venta.persona_id)
      .maybeSingle(),
    venta.vendedor_usuario_id
      ? admin
          .schema('core')
          .from('usuarios')
          .select('first_name, last_name, email')
          .eq('id', venta.vendedor_usuario_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    venta.unidad_id
      ? admin
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id')
          .eq('id', venta.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let proyectoNombre = '';
  if (unidad?.proyecto_id) {
    const { data: proyecto } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = proyecto?.nombre ?? '';
  }

  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';
  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    venta.vendedor ||
    null;

  const emailCtx: HoldEmailContext = {
    ventaId: venta.id,
    empresaId: venta.empresa_id,
    vendedorEmail: usuario?.email ?? null,
    vendedorNombre,
    clienteEmail: persona?.email ?? null,
    clienteNombre,
    unidadIdentificador: unidad?.identificador ?? '(sin unidad)',
    proyectoNombre,
    expiraAt: venta.expira_at ? new Date(venta.expira_at) : null,
  };

  const res = await sendHoldEmail('hold_creado', emailCtx);
  if (!res.ok) {
    // No marcamos el timestamp — el cron lo intentará de nuevo en su próxima
    // vuelta. Retornamos 200 para que el form no muestre error al usuario
    // (la venta ya está creada; el email es secundario).
    return NextResponse.json({ ok: false, sentTo: [], error: res.error ?? 'send failed' });
  }

  // Marcar timestamp con admin client (la RLS de UPDATE en `dilesa.ventas`
  // probablemente restringe modificar `notif_hold_creado_at` desde el cliente).
  await admin
    .schema('dilesa')
    .from('ventas')
    .update({ notif_hold_creado_at: new Date().toISOString() })
    .eq('id', venta.id);

  return NextResponse.json({ ok: true, sentTo: res.sentTo });
}
