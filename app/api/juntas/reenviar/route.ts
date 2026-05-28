/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public`; para `core` usamos `as any`.
 * Mismo patrón que `juntas/terminar/route.ts` y otras routes server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/validation';
import { buildMinutaEmailPayload, sendMinutaEmail } from '@/lib/juntas/email';

const ReenviarJuntaSchema = z.object({
  juntaId: z.string().uuid('juntaId must be a valid UUID'),
});

export async function POST(req: NextRequest) {
  const parsed = await validateBody(req, ReenviarJuntaSchema);
  if (!parsed.ok) return parsed.response;
  const { juntaId } = parsed.data;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  // Auth gate: el endpoint usa service-role para reenviar la minuta al consejo
  // por email. Antes de este cambio cualquier usuario autenticado (sin importar
  // empresa o permisos) podía disparar el reenvío de cualquier junta — IDOR
  // sobre `juntaId` cross-empresa. Patrón canónico (igual que `juntas/terminar`):
  // auth.getUser() + lookup `core.usuarios` por email + membresía en la empresa
  // dueña de la junta (admin global pasa por encima).
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

  const { data: junta, error: jErr } = await supabase
    .schema('erp')
    .from('juntas')
    .select('estado, fecha_terminada, duracion_minutos, empresa_id')
    .eq('id', juntaId)
    .single();

  if (jErr || !junta) {
    return NextResponse.json({ error: jErr?.message ?? 'Junta not found' }, { status: 404 });
  }

  // Verificación de acceso: admin global o miembro activo de la empresa dueña.
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
      .eq('empresa_id', junta.empresa_id)
      .eq('activo', true)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 });
    }
  }

  if (junta.estado !== 'completada') {
    return NextResponse.json(
      { error: 'Solo se puede reenviar una junta que ya fue completada.' },
      { status: 400 }
    );
  }

  const fechaTerminadaISO = (junta.fecha_terminada as string | null) ?? new Date().toISOString();

  const payload = await buildMinutaEmailPayload(supabase, juntaId, {
    fechaTerminadaISO,
    duracionMinutos: (junta.duracion_minutos as number | null) ?? null,
  });
  if (!payload.ok) {
    return NextResponse.json({ error: payload.error }, { status: payload.status });
  }

  if (payload.recipients.length === 0) {
    return NextResponse.json({
      success: true,
      emailsSent: 0,
      warning: 'No attendee emails found – no se envió el correo.',
    });
  }

  const result = await sendMinutaEmail(resendKey, payload, {
    sb: supabase,
    slug: 'junta_reenviar',
    empresaId: payload.empresaId,
    juntaId,
  });
  if (!result.ok) {
    return NextResponse.json({ success: true, emailsSent: 0, emailError: result.emailError });
  }

  return NextResponse.json({
    success: true,
    emailsSent: payload.recipients.length,
    emailId: result.emailId,
  });
}
