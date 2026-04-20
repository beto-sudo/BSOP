import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const { data: junta, error: jErr } = await supabase
    .schema('erp')
    .from('juntas')
    .select('estado, fecha_terminada, duracion_minutos')
    .eq('id', juntaId)
    .single();

  if (jErr || !junta) {
    return NextResponse.json({ error: jErr?.message ?? 'Junta not found' }, { status: 404 });
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
