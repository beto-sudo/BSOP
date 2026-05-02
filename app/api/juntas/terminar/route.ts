/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public`; para `core` usamos `as any`.
 * Mismo patrón que `lib/empresas/admin-guard.ts` y otras routes server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/validation';
import { buildMinutaEmailPayload, sendMinutaEmail } from '@/lib/juntas/email';

const TerminarJuntaSchema = z.object({
  juntaId: z.string().uuid('juntaId must be a valid UUID'),
});

export async function POST(req: NextRequest) {
  const parsed = await validateBody(req, TerminarJuntaSchema);
  if (!parsed.ok) return parsed.response;
  const { juntaId } = parsed.data;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Auth gate: el endpoint dispara escritura en `erp.juntas` + `core.usuarios`
  // + envío de minuta por email. Antes de este cambio cualquier llamador
  // (incluso anónimo) podía cerrar cualquier junta y disparar el email.
  // Patrón canónico: auth.getUser() + lookup `core.usuarios` por email +
  // membresía en la empresa de la junta (admin pasa por encima).
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  // Duración calculada contra created_at (arranque real) porque fecha_hora
  // viene de un datetime-local sin timezone y frecuentemente está desfasado.
  // empresa_id se incluye para validar membresía del caller.
  const { data: existing } = await supabase
    .schema('erp')
    .from('juntas')
    .select('fecha_hora, created_at, empresa_id')
    .eq('id', juntaId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Junta no encontrada' }, { status: 404 });
  }

  // Verificación de acceso: admin global o miembro activo de la empresa.
  const { data: coreUser } = await (supabase.schema('core') as any)
    .from('usuarios')
    .select('id, rol, activo')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (!coreUser || !coreUser.activo) {
    return NextResponse.json({ error: 'Usuario sin acceso activo' }, { status: 403 });
  }
  if (coreUser.rol !== 'admin') {
    const { data: membership } = await (supabase.schema('core') as any)
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', coreUser.id)
      .eq('empresa_id', existing.empresa_id)
      .eq('activo', true)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 });
    }
  }

  const now = new Date();
  const startRef = existing.created_at ?? existing.fecha_hora;
  const duracionMinutos = startRef
    ? Math.round((now.getTime() - new Date(startRef as string).getTime()) / 60000)
    : null;

  const { error: jErr } = await supabase
    .schema('erp')
    .from('juntas')
    .update({
      estado: 'completada',
      fecha_terminada: now.toISOString(),
      ...(duracionMinutos && duracionMinutos > 0 ? { duracion_minutos: duracionMinutos } : {}),
    })
    .eq('id', juntaId);

  if (jErr) {
    return NextResponse.json({ error: jErr.message }, { status: 404 });
  }

  // Limpia la junta activa de todos los usuarios que la tenían marcada — a
  // partir de aquí los avances nuevos ya no deben ligarse a esta junta.
  await supabase
    .schema('core')
    .from('usuarios')
    .update({ junta_activa_id: null })
    .eq('junta_activa_id', juntaId);

  const payload = await buildMinutaEmailPayload(supabase, juntaId, {
    fechaTerminadaISO: now.toISOString(),
    duracionMinutos,
  });
  if (!payload.ok) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  if (payload.recipients.length === 0) {
    return NextResponse.json({
      success: true,
      emailsSent: 0,
      warning: 'No attendee emails found – junta completada but no email sent.',
    });
  }

  const result = await sendMinutaEmail(resendKey, payload);
  if (!result.ok) {
    return NextResponse.json({ success: true, emailsSent: 0, emailError: result.emailError });
  }

  return NextResponse.json({
    success: true,
    emailsSent: payload.recipients.length,
    emailId: result.emailId,
  });
}
