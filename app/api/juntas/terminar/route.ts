import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a UTC ISO string to CST (America/Matamoros) human-readable */
function formatDateCST(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Chicago', // CST/CDT — same as America/Matamoros
  });
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Chicago' });
}

// ─── Email template ───────────────────────────────────────────────────────────

const HEADER_IMAGE_URL = 'https://bsop.io/logos/dilesa-header.jpg';

function generateMinutaHtml(opts: {
  titulo: string;
  tipo: string | null;
  fechaInicio: string;
  fechaTerminada: string;
  duracionMinutos: number | null;
  descripcion: string | null;
  asistentes: { nombre: string }[];
  tareas: { titulo: string; responsable: string; fecha_compromiso: string | null }[];
}): string {
  const { titulo, tipo, fechaInicio, fechaTerminada, duracionMinutos, descripcion, asistentes, tareas } = opts;

  const asistentesStr = asistentes.length > 0
    ? asistentes.map(a => a.nombre).join(', ')
    : 'Sin participantes registrados';

  const tareasHtml = tareas.length > 0
    ? `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Tarea</th>
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Fecha Compromiso</th>
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Responsable</th>
      </tr>
      ${tareas.map(t => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${t.titulo}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;white-space:nowrap;">${formatShortDate(t.fecha_compromiso)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${t.responsable}</td>
      </tr>`).join('')}
    </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;">

    <!-- Header Image -->
    <div style="background:#1a1a2e;">
      <img src="${HEADER_IMAGE_URL}" alt="DILESA" style="display:block;width:100%;max-width:680px;height:auto;" />
    </div>

    <!-- Title Bar -->
    <div style="background:#1a1a2e;padding:20px 32px 24px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.4;">${titulo}</h1>
    </div>

    <!-- Info Section -->
    <div style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;width:140px;vertical-align:top;">Nombre de Junta</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${titulo}</td>
        </tr>
        ${tipo ? `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Tipo</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${tipo}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Fecha de Junta</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${formatDateCST(fechaInicio)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Junta Terminada</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${formatDateCST(fechaTerminada)}</td>
        </tr>
        ${duracionMinutos && duracionMinutos > 0 ? `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Duración</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${formatDuration(duracionMinutos)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Asistentes</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${asistentesStr}</td>
        </tr>
      </table>
    </div>

    <!-- Temas / Minuta -->
    ${descripcion ? `
    <div style="padding:28px 32px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Temas</h2>
      <div style="font-size:14px;color:#334155;line-height:1.8;">
        ${descripcion}
      </div>
    </div>` : `
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#94a3b8;font-style:italic;">Sin notas registradas para esta junta.</p>
    </div>`}

    <!-- Tareas -->
    ${tareas.length > 0 ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Tareas Asignadas</h2>
      ${tareasHtml}
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Enviado desde BSOP &middot; <a href="https://bsop.io" style="color:#6366f1;text-decoration:none;">bsop.io</a></p>
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

  // ── Fetch junta to calculate duration ──────────────────────────────────────
  const { data: existing } = await supabase
    .schema('erp' as any).from('juntas').select('fecha_hora').eq('id', juntaId).single();

  const now = new Date();
  const duracionMinutos = existing?.fecha_hora
    ? Math.round((now.getTime() - new Date(existing.fecha_hora as string).getTime()) / 60000)
    : null;

  // ── Update junta: completada + auto duration ───────────────────────────────
  const { data: junta, error: jErr } = await supabase
    .schema('erp' as any)
    .from('juntas')
    .update({
      estado: 'completada',
      fecha_terminada: now.toISOString(),
      ...(duracionMinutos && duracionMinutos > 0 ? { duracion_minutos: duracionMinutos } : {}),
    })
    .eq('id', juntaId)
    .select('id, titulo, tipo, fecha_hora, lugar, descripcion, empresa_id')
    .single();

  if (jErr || !junta) {
    return NextResponse.json({ error: jErr?.message ?? 'Junta not found' }, { status: 404 });
  }

  // ── Fetch attendees ────────────────────────────────────────────────────────
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

  // ── Fetch tasks created in this meeting ────────────────────────────────────
  const { data: tasksData } = await supabase
    .schema('erp' as any)
    .from('tasks')
    .select('titulo, fecha_compromiso, asignado_a')
    .eq('entidad_tipo', 'junta')
    .eq('entidad_id', juntaId);

  const empleadoIds = [...new Set((tasksData ?? []).map((t: any) => t.asignado_a).filter(Boolean))];
  const { data: empData } = empleadoIds.length > 0
    ? await supabase.schema('erp' as any).from('empleados').select('id, persona:persona_id(nombre, apellido_paterno)').in('id', empleadoIds)
    : { data: [] };
  const empMap = new Map((empData ?? []).map((e: any) => [e.id, [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' ')]));

  const tareas = (tasksData ?? []).map((t: any) => ({
    titulo: t.titulo as string,
    responsable: empMap.get(t.asignado_a) || 'Sin asignar',
    fecha_compromiso: t.fecha_compromiso as string | null,
  }));

  // ── Generate email ─────────────────────────────────────────────────────────
  const html = generateMinutaHtml({
    titulo: junta.titulo as string,
    tipo: junta.tipo as string | null,
    fechaInicio: junta.fecha_hora as string,
    fechaTerminada: now.toISOString(),
    duracionMinutos,
    descripcion: junta.descripcion as string | null,
    asistentes,
    tareas,
  });

  // ── Send email ─────────────────────────────────────────────────────────────
  if (recipients.length === 0) {
    return NextResponse.json({
      success: true,
      emailsSent: 0,
      warning: 'No attendee emails found – junta marked as completada but no email sent.',
    });
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'DILESA <noreply@bsop.io>',
      to: recipients,
      subject: junta.titulo as string,
      html,
    }),
  });

  const emailResult = await emailRes.json();

  if (!emailRes.ok) {
    return NextResponse.json({ success: true, emailsSent: 0, emailError: emailResult });
  }

  return NextResponse.json({
    success: true,
    emailsSent: recipients.length,
    emailId: emailResult.id,
  });
}
