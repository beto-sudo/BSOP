/* eslint-disable @typescript-eslint/no-explicit-any --
 * TODO(audit-T2): type the Supabase join results below with Database types.
 * The `any` usages are on .map() callbacks over joined query rows where the
 * Supabase client doesn't infer the join shape. Tracked in the 2026-04-16
 * audit's T2 item (eliminate `any` progressively). Out of scope for this
 * API-hardening PR; scheduled for a dedicated typing cleanup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { validateBody } from '@/lib/validation';

const TerminarJuntaSchema = z.object({
  juntaId: z.string().uuid('juntaId must be a valid UUID'),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateCST(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
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
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Chicago',
  });
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
  actualizaciones?: { tarea: string; contenido: string; tipo: string; autor: string }[];
}): string {
  const {
    titulo,
    fechaTerminada,
    duracionMinutos,
    descripcion,
    asistentes,
    tareasCreadas,
    tareasCompletadas,
    actualizaciones,
  } = opts;

  const asistentesStr =
    asistentes.length > 0
      ? asistentes.map((a) => a.nombre).join(', ')
      : 'Sin participantes registrados';

  const tareasTable = (
    items: { titulo: string; responsable: string; fecha_compromiso?: string | null }[],
    showFecha: boolean
  ) => `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Tarea</th>
        ${showFecha ? '<th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Fecha Compromiso</th>' : ''}
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Responsable</th>
      </tr>
      ${items
        .map(
          (t) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${t.titulo}</td>
        ${showFecha ? `<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;white-space:nowrap;">${formatShortDate((t as any).fecha_compromiso)}</td>` : ''}
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${t.responsable}</td>
      </tr>`
        )
        .join('')}
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
        ${
          duracionMinutos && duracionMinutos > 0
            ? `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Duración</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${formatDuration(duracionMinutos)}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#64748b;font-weight:600;vertical-align:top;">Asistentes</td>
          <td style="padding:6px 0;font-size:13px;color:#1e293b;">${asistentesStr}</td>
        </tr>
      </table>
    </div>

    <!-- Temas / Minuta -->
    ${
      descripcion
        ? `
    <div style="padding:28px 32px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Temas</h2>
      <div style="font-size:14px;color:#334155;line-height:1.8;word-break:break-word;">
        ${descripcion.replace(/<img /g, '<img style="max-width:100%;height:auto;border-radius:8px;" ')}
      </div>
    </div>`
        : `
    <div style="padding:28px 32px;">
      <p style="font-size:14px;color:#94a3b8;font-style:italic;">Sin notas registradas para esta junta.</p>
    </div>`
    }

    <!-- Tareas Creadas -->
    ${
      tareasCreadas.length > 0
        ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Tareas Asignadas (${tareasCreadas.length})</h2>
      ${tareasTable(tareasCreadas, true)}
    </div>`
        : ''
    }

    <!-- Tareas Completadas -->
    ${
      tareasCompletadas.length > 0
        ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#22c55e;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">✓ Tareas Completadas en esta Junta (${tareasCompletadas.length})</h2>
      ${tareasTable(tareasCompletadas, false)}
    </div>`
        : ''
    }

    <!-- Actualizaciones Reportadas -->
    ${
      actualizaciones && actualizaciones.length > 0
        ? `
    <div style="padding:0 32px 28px;">
      <h2 style="font-size:16px;font-weight:700;color:#6366f1;margin:0 0 12px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Actualizaciones Reportadas (${actualizaciones.length})</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Tarea</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Actualización</th>
          <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Tipo</th>
        </tr>
        ${actualizaciones
          .map(
            (a) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${a.tarea}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${a.contenido}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;white-space:nowrap;">${a.tipo}</td>
        </tr>`
          )
          .join('')}
      </table>
    </div>`
        : ''
    }

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

  // ── Fetch junta to calculate duration ──────────────────────────────────────
  // Use created_at (server timestamp at real start) instead of fecha_hora
  // (datetime-local input stored without timezone, often off by UTC offset)
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

  // ── Update junta: completada + auto duration ───────────────────────────────
  const { data: junta, error: jErr } = await supabase
    .schema('erp')
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
    .schema('erp')
    .from('juntas_asistencia')
    .select('asistio, persona:persona_id(nombre, apellido_paterno, email)')
    .eq('junta_id', juntaId);

  const asistentes = (asistencia ?? []).map((a: any) => ({
    nombre:
      [a.persona?.nombre, a.persona?.apellido_paterno].filter(Boolean).join(' ') || 'Participante',
    email: (a.persona?.email as string | null) ?? null,
    asistio: a.asistio as boolean | null,
  }));

  const recipients = asistentes.filter((a) => Boolean(a.email)).map((a) => a.email as string);

  // ── Fetch tasks linked to this meeting ─────────────────────────────────────
  const { data: tasksData } = await supabase
    .schema('erp')
    .from('tasks')
    .select('titulo, estado, fecha_compromiso, asignado_a')
    .eq('entidad_tipo', 'junta')
    .eq('entidad_id', juntaId);

  const empleadoIds = [...new Set((tasksData ?? []).map((t: any) => t.asignado_a).filter(Boolean))];
  const { data: empData } =
    empleadoIds.length > 0
      ? await supabase
          .schema('erp')
          .from('empleados')
          .select('id, persona:persona_id(nombre, apellido_paterno)')
          .in('id', empleadoIds)
      : { data: [] };
  const empMap = new Map(
    (empData ?? []).map((e: any) => [
      e.id,
      [e.persona?.nombre, e.persona?.apellido_paterno].filter(Boolean).join(' '),
    ])
  );

  const allTasks = (tasksData ?? []).map((t: any) => ({
    titulo: t.titulo as string,
    estado: t.estado as string,
    responsable: empMap.get(t.asignado_a) || 'Sin asignar',
    fecha_compromiso: t.fecha_compromiso as string | null,
  }));

  const tareasCreadas = allTasks.filter(
    (t) => t.estado !== 'completado' && t.estado !== 'cancelado'
  );
  const tareasCompletadas = allTasks.filter((t) => t.estado === 'completado');

  // ── Fetch task updates reported during this meeting ────────────────────────
  const taskIds = (tasksData ?? []).map((t: any) => t.id as string);
  let actualizaciones: { tarea: string; contenido: string; tipo: string; autor: string }[] = [];
  if (taskIds.length > 0) {
    const { data: updatesData } = await supabase
      .schema('erp')
      .from('task_updates')
      .select('task_id, tipo, contenido, valor_anterior, valor_nuevo, creado_por')
      .in('task_id', taskIds);

    if (updatesData && updatesData.length > 0) {
      const taskTitleMap = new Map((tasksData ?? []).map((t: any) => [t.id, t.titulo as string]));
      const updateUserIds = [...new Set(updatesData.map((u: any) => u.creado_por).filter(Boolean))];
      const { data: updateUsersData } =
        updateUserIds.length > 0
          ? await supabase
              .schema('core')
              .from('usuarios')
              .select('id, first_name')
              .in('id', updateUserIds)
          : { data: [] };
      const updateUserMap = new Map(
        (updateUsersData ?? []).map((u: any) => [u.id, (u.first_name as string | null) ?? ''])
      );

      const tipoLabels: Record<string, string> = {
        avance: 'Avance',
        cambio_estado: 'Cambio de estado',
        cambio_fecha: 'Cambio de fecha',
        nota: 'Nota',
        cambio_responsable: 'Cambio responsable',
      };
      actualizaciones = updatesData.map((u: any) => {
        let contenido = (u.contenido as string) ?? '';
        if (u.valor_anterior != null && u.valor_nuevo != null) {
          contenido = contenido
            ? `${contenido} (${u.valor_anterior} → ${u.valor_nuevo})`
            : `${u.valor_anterior} → ${u.valor_nuevo}`;
        }
        return {
          tarea: taskTitleMap.get(u.task_id) ?? 'Tarea',
          contenido,
          tipo: tipoLabels[u.tipo as string] ?? u.tipo,
          autor: updateUserMap.get(u.creado_por) ?? '',
        };
      });
    }
  }

  // ── Generate email ─────────────────────────────────────────────────────────
  const html = generateMinutaHtml({
    titulo: junta.titulo as string,
    fechaTerminada: now.toISOString(),
    duracionMinutos,
    descripcion: junta.descripcion as string | null,
    asistentes,
    tareasCreadas,
    tareasCompletadas,
    actualizaciones,
  });

  // ── Send email ─────────────────────────────────────────────────────────────
  if (recipients.length === 0) {
    return NextResponse.json({
      success: true,
      emailsSent: 0,
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

  return NextResponse.json({
    success: true,
    emailsSent: recipients.length,
    emailId: emailResult.id,
  });
}
