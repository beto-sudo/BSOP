import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  // Duración calculada contra created_at (arranque real) porque fecha_hora
  // viene de un datetime-local sin timezone y frecuentemente está desfasado.
  const { data: existing } = await supabase
    .schema('erp')
    .from('juntas')
    .select('fecha_hora, created_at')
    .eq('id', juntaId)
    .single();

  const now = new Date();
  const startRef = existing?.created_at ?? existing?.fecha_hora;
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
