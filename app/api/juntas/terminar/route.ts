import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateCST(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
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
  fechaTerminada: string;
  duracionMinutos: number | null;
  descripcion: string | null;
  asistentes: { nombre: string }[];
  tareasCreadas: { titulo: string; responsable: string; fecha_compromiso: string | null }[];
  tareasCompletadas: { titulo: string; responsable: string }[];
}): string {
  const { titulo, fechaTerminada, duracionMinutos, descripcion, asistentes, tareasCreadas, tareasCompletadas } = opts;

  const asistentesStr = asistentes.length > 0
    ? asistentes.map(a => a.nombre).join(', ')
    : 'Sin participantes registrados';

  const tareasTable = (items: { titulo: string; responsable: string; fecha_compromiso?: string | null }[], showFecha: boolean) => `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Tarea</th>
        ${showFecha ? '<th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Fecha Compromiso</th>' : ''}
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Responsable</th>
      </tr>
      ${items.map(t => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${t.titulo}</td>
        ${showFecha ? `<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;white-space:nowrap;">${formatShortDate((t as any).fecha_compromiso)}</td>` : ''}
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${t.responsable}</td>
      </tr>`).join('')}
    </table>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="width:100%;background:#ffffff;">

    <!-- Header Image -->
    <div style="background:#1a1a2e;">
      <img src="${HEADER_IMAGE_URL}" alt="DILESA" style="display:block;width:100%;height:auto;" />
    </div>

    <!-- Title Bar -->
    <div style="background:#1a1a2e;padding:20px 32px 24px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.4;">${titulo}</h1>
    </div>

    <!-- Info Section -->
    <div style="padding:24px 32px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;width:160px;vertical-align:top;">Junta Terminada</td>
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
      <div style="font-size:14px;color:#334155;line-height:1.8;word-break:break-word;">
        ${descripcion.replace(/<img /g, '<img style="max-width:100%;height:auto;border-radius:8px;" ')}
      </div>
    </div>` : `
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#94a3b8;font-style:italic;">Sin notas registradas para esta junta.</p>
    </div>`}

    <!-- Tareas Creadas -->
    ${tareasCreadas.length > 0 ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Tareas Asignadas (${tareasCreadas.length})</h2>
      ${tareasTable(tareasCreadas, true)}
    </div>` : ''}

    <!-- Tareas Completadas -->
    ${tareasCompletadas.length > 0 ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#22c55e;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">✓ Tareas Completadas en esta Junta (${tareasCompletadas.length})</h2>
      ${tareasTable(tareasCompletadas, false)}
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
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
  // Use created_at (server timestamp at real start) instead of fecha_hora
  // (datetime-local input stored without timezone, often off by UTC offset)
  const { data: existing } = await supabase
    .schema('erp' as any).from('juntas').select('fecha_hora, created_at').eq('id', juntaId).single();

  const now = new Date();
  const startRef = existing?.created_at ?? existing?.fecha_hora;
  const duracionMinutos = startRef
    ? Math.round((now.getTime() - new Date(startRef as string).getTime()) / 60000)
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

  // ── Fetch tasks linked to this meeting ─────────────────────────────────────
  const { data: tasksData } = await supabase
    .schema('erp' as any)
    .from('tasks')
    .select('titulo, estado, fecha_compromiso, asignado_a')
    .eq('entidad_tipo', 'junta')
    .eq('entidad_id', juntaId);

  const empleadoIds = [...new Set((tasksData ?? []).map((t: any) => t.asignado_a).filter(Boolean))];
  const { data: empData } = empleadoIds.length > 0
    ? await supabase.schema('erp' as any).from('empleados').select('id, persona:persona_id(nombre, apellido_paterno)').in('id', empleadoIds)
    : { data: [] };
  const empMap = new Map((empData ?? []).map((e: any) => [e.id, [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' ')]));

  const allTasks = (tasksData ?? []).map((t: any) => ({
    titulo: t.titulo as string,
    estado: t.estado as string,
    responsable: empMap.get(t.asignado_a) || 'Sin asignar',
    fecha_compromiso: t.fecha_compromiso as string | null,
  }));

  const tareasCreadas = allTasks.filter(t => t.estado !== 'completado' && t.estado !== 'cancelado');
  const tareasCompletadas = allTasks.filter(t => t.estado === 'completado');

  // ── Generate email ─────────────────────────────────────────────────────────
  const html = generateMinutaHtml({
    titulo: junta.titulo as string,
    fechaTerminada: now.toISOString(),
    duracionMinutos,
    descripcion: junta.descripcion as string | null,
    asistentes,
    tareasCreadas,
    tareasCompletadas,
  });

  // ── Send email ─────────────────────────────────────────────────────────────
  if (recipients.length === 0) {
    return NextResponse.json({
      success: true, emailsSent: 0,
      warning: 'No attendee emails found – junta completada but no email sent.',
    });
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>',
      to: recipients,
      subject: junta.titulo as string,
      html,
    }),
  });

  const emailResult = await emailRes.json();

  if (!emailRes.ok) {
    return NextResponse.json({ success: true, emailsSent: 0, emailError: emailResult });
  }

  return NextResponse.json({ success: true, emailsSent: recipients.length, emailId: emailResult.id });
}
