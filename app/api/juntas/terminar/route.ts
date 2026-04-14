import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

// ─── Email template ───────────────────────────────────────────────────────────

function generateJuntaMinutaHtml(opts: {
  titulo: string;
  fechaHora: string;
  lugar: string | null;
  descripcion: string | null;
  asistentes: { nombre: string; asistio: boolean | null }[];
}): string {
  const { titulo, fechaHora, lugar, descripcion, asistentes } = opts;

  const fechaFormatted = new Date(fechaHora).toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  });

  const asistentesHtml =
    asistentes.length > 0
      ? asistentes
          .map((a) => {
            const badge =
              a.asistio === true
                ? '<span style="color:#22c55e;font-weight:600;">✓ Asistió</span>'
                : a.asistio === false
                ? '<span style="color:#ef4444;font-weight:600;">✗ No asistió</span>'
                : '<span style="color:#94a3b8;">— Sin confirmar</span>';
            return `
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${a.nombre}</td>
              <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;">${badge}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="2" style="padding:8px 0;color:#94a3b8;font-size:13px;">Sin participantes registrados</td></tr>';

  const notesSection = descripcion
    ? `
      <div style="margin-top:28px;">
        <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 12px;">Notas y Minuta</h2>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;font-size:14px;color:#334155;line-height:1.7;">
          ${descripcion}
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Minuta: ${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 32px 24px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#64748b;text-transform:uppercase;margin-bottom:8px;">BSOP · Minuta de Junta</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#f8fafc;line-height:1.3;">${titulo}</h1>
    </div>

    <!-- Meta info -->
    <div style="padding:20px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;width:80px;">Fecha</td>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:600;">${fechaFormatted}</td>
        </tr>
        ${lugar ? `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">Lugar</td>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;">${lugar}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b;">Estado</td>
          <td style="padding:4px 0;font-size:13px;color:#22c55e;font-weight:700;">Completada</td>
        </tr>
      </table>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px 36px;">

      <!-- Participants -->
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 12px;">Participantes</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${asistentesHtml}
      </table>

      ${notesSection}

    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Generado por BSOP &middot; bsop.io</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { juntaId } = body as { juntaId?: string };

  if (!juntaId) {
    return NextResponse.json({ error: 'Missing juntaId' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  // ── Update junta: mark as completada ───────────────────────────────────────
  const { data: junta, error: jErr } = await supabase
    .schema('erp' as any)
    .from('juntas')
    .update({
      estado: 'completada',
      fecha_terminada: new Date().toISOString(),
    })
    .eq('id', juntaId)
    .select('id, titulo, fecha_hora, lugar, descripcion, empresa_id')
    .single();

  if (jErr || !junta) {
    return NextResponse.json(
      { error: jErr?.message ?? 'Junta not found' },
      { status: 404 },
    );
  }

  // ── Fetch attendees with email via personas ────────────────────────────────
  const { data: asistencia } = await supabase
    .schema('erp' as any)
    .from('juntas_asistencia')
    .select('asistio, persona:persona_id(nombre, apellido_paterno, email)')
    .eq('junta_id', juntaId);

  const asistentes = (asistencia ?? []).map((a: any) => ({
    nombre: [a.persona?.nombre, a.persona?.apellido_paterno].filter(Boolean).join(' ') || 'Participante',
    email: (a.persona?.email as string | null) ?? null,
    asistio: a.asistio as boolean | null,
  }));

  const recipients = asistentes
    .filter((a) => Boolean(a.email))
    .map((a) => a.email as string);

  // ── Generate and send email ───────────────────────────────────────────────
  if (recipients.length === 0) {
    return NextResponse.json({
      success: true,
      emailsSent: 0,
      warning: 'No attendee emails found – DB updated but no email sent.',
    });
  }

  const html = generateJuntaMinutaHtml({
    titulo: junta.titulo as string,
    fechaHora: junta.fecha_hora as string,
    lugar: junta.lugar as string | null,
    descripcion: junta.descripcion as string | null,
    asistentes,
  });

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BSOP <noreply@bsop.io>',
      to: recipients,
      subject: `Minuta: ${junta.titulo}`,
      html,
    }),
  });

  const emailResult = await emailRes.json();

  if (!emailRes.ok) {
    // DB was updated; report email failure without rolling back
    return NextResponse.json({
      success: true,
      emailsSent: 0,
      emailError: emailResult,
    });
  }

  return NextResponse.json({
    success: true,
    emailsSent: recipients.length,
    emailId: emailResult.id,
  });
}
