/* eslint-disable @typescript-eslint/no-explicit-any --
 * Compartido entre app/api/juntas/terminar/route.ts y
 * app/api/juntas/reenviar/route.ts. Los `any` vienen de rows de Supabase
 * sin tipado fuerte; mismo patrón que el caller original.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { rewriteHtmlImagesWithSignedUrls } from '@/lib/adjuntos';
import { fetchJuntaUpdates } from '@/lib/juntas/fetch-updates';

// 1 año — los correos pueden abrirse meses después (archivo, reenvíos).
// La firma es server-side con service role, sin costo por TTLs largos.
export const EMAIL_IMAGE_TTL_SECONDS = 365 * 24 * 60 * 60;

// Asset base para resolver rutas relativas (/logos/foo.jpg) en correos enviados.
const ASSET_BASE_URL = 'https://bsop.io';

// Header de fallback cuando la empresa no tiene `header_url` configurado en
// `core.empresas`. Mantener apuntando a DILESA hasta que cada empresa cargue
// su propio asset.
const FALLBACK_HEADER_URL = `${ASSET_BASE_URL}/logos/dilesa-header.jpg`;

// Mientras cada empresa configura su propio buzón de consejo, todas usan el de
// DILESA. Agregar entradas aquí cuando una empresa estrene el suyo.
const CONSEJO_EMAIL_DEFAULT = 'consejo@dilesa.mx';
const CONSEJO_EMAIL_BY_EMPRESA: Record<string, string> = {
  'f5942ed4-7a6b-4c39-af18-67b9fbf7f479': 'consejo@dilesa.mx', // DILESA
};

// Override del display name del "From"; preserva la identidad histórica
// (razón social) que ya estaba en uso para DILESA. Si una empresa no tiene
// override aquí, se cae a `nombre_comercial || nombre`.
const FROM_DISPLAY_OVERRIDE: Record<string, string> = {
  'f5942ed4-7a6b-4c39-af18-67b9fbf7f479': 'Desarrollo Inmobiliario los Encinos', // DILESA
};

// Compat: callers externos importaban `CONSEJO_EMAIL`. Hoy nadie lo usa pero
// se exporta para no romper integraciones futuras que lo busquen.
export const CONSEJO_EMAIL = CONSEJO_EMAIL_DEFAULT;

function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${ASSET_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function consejoEmailFor(empresaId: string | null | undefined): string {
  if (!empresaId) return CONSEJO_EMAIL_DEFAULT;
  return CONSEJO_EMAIL_BY_EMPRESA[empresaId] ?? CONSEJO_EMAIL_DEFAULT;
}

function fromAddressFor(empresa: {
  id: string;
  nombre: string;
  nombre_comercial: string | null;
}): string {
  const display =
    FROM_DISPLAY_OVERRIDE[empresa.id] || empresa.nombre_comercial?.trim() || empresa.nombre;
  return `${display} <noreply@bsop.io>`;
}

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

export function generateMinutaHtml(opts: {
  titulo: string;
  fechaTerminada: string;
  duracionMinutos: number | null;
  descripcion: string | null;
  asistentes: { nombre: string }[];
  tareasCreadas: { titulo: string; responsable: string; fecha_compromiso: string | null }[];
  tareasCompletadas: { titulo: string; responsable: string }[];
  actualizaciones?: { tarea: string; contenido: string; tipo: string; autor: string }[];
  empresaNombre: string;
  headerImageUrl: string;
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
    empresaNombre,
    headerImageUrl,
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
      <img src="${headerImageUrl}" alt="${empresaNombre}" style="display:block;width:100%;height:auto;" />
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

/**
 * Recolecta datos de la junta ya persistida (asistentes, tareas, actualizaciones
 * durante la ventana) y construye el HTML + la lista de destinatarios del
 * correo. No toca la fila de la junta ni envía el mensaje — solo prepara el
 * payload. Compartido entre el flujo de terminar y el de reenviar.
 */
export async function buildMinutaEmailPayload(
  supabase: SupabaseClient,
  juntaId: string,
  opts: {
    fechaTerminadaISO: string;
    duracionMinutos: number | null;
  }
): Promise<
  | {
      ok: true;
      html: string;
      subject: string;
      from: string;
      recipients: string[];
      asistentesCount: number;
    }
  | { ok: false; status: number; error: string }
> {
  const { data: junta, error: jErr } = await supabase
    .schema('erp')
    .from('juntas')
    .select(
      'id, titulo, tipo, fecha_hora, fecha_terminada, lugar, descripcion, empresa_id, enviar_a_consejo'
    )
    .eq('id', juntaId)
    .single();

  if (jErr || !junta) {
    return { ok: false, status: 404, error: jErr?.message ?? 'Junta not found' };
  }

  // Branding por empresa: logo del header + display name del "From".
  const empresaId = (junta as any).empresa_id as string | null;
  const { data: empresaRow } = empresaId
    ? await supabase
        .schema('core')
        .from('empresas')
        .select('id, nombre, nombre_comercial, header_url, logo_url')
        .eq('id', empresaId)
        .single()
    : { data: null };

  const empresa = (empresaRow ?? {
    id: empresaId ?? '',
    nombre: 'BSOP',
    nombre_comercial: null,
    header_url: null,
    logo_url: null,
  }) as {
    id: string;
    nombre: string;
    nombre_comercial: string | null;
    header_url: string | null;
    logo_url: string | null;
  };

  const headerImageUrl =
    resolveAssetUrl(empresa.header_url) ?? resolveAssetUrl(empresa.logo_url) ?? FALLBACK_HEADER_URL;
  const fromAddress = fromAddressFor(empresa);

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

  const attendeeEmails = asistentes
    .filter((a) => Boolean(a.email))
    .map((a) => (a.email as string).toLowerCase());
  const enviarAConsejo = (junta as any).enviar_a_consejo ?? true;
  const recipients = enviarAConsejo
    ? Array.from(new Set([...attendeeEmails, consejoEmailFor(empresaId)]))
    : attendeeEmails;

  const { data: tasksData } = await supabase
    .schema('erp')
    .from('tasks')
    .select('id, titulo, estado, fecha_compromiso, asignado_a')
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

  // Avances ligados a esta junta por junta_id (trigger de DB).
  let actualizaciones: { tarea: string; contenido: string; tipo: string; autor: string }[] = [];

  const { data: updatesData } = await fetchJuntaUpdates(supabase, {
    juntaId: (junta as any).id,
    columns: 'task_id, tipo, contenido, valor_anterior, valor_nuevo, creado_por, created_at',
  });

  if (updatesData && updatesData.length > 0) {
    const uTaskIds = [...new Set(updatesData.map((u: any) => u.task_id).filter(Boolean))];
    const { data: uTasksData } =
      uTaskIds.length > 0
        ? await supabase.schema('erp').from('tasks').select('id, titulo').in('id', uTaskIds)
        : { data: [] };
    const taskTitleMap = new Map((uTasksData ?? []).map((t: any) => [t.id, t.titulo as string]));
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

  const descripcionParaCorreo = await rewriteHtmlImagesWithSignedUrls(
    supabase,
    (junta as any).descripcion as string | null,
    EMAIL_IMAGE_TTL_SECONDS
  );

  const html = generateMinutaHtml({
    titulo: junta.titulo as string,
    fechaTerminada: opts.fechaTerminadaISO,
    duracionMinutos: opts.duracionMinutos,
    descripcion: descripcionParaCorreo || null,
    asistentes,
    tareasCreadas,
    tareasCompletadas,
    actualizaciones,
    empresaNombre: empresa.nombre_comercial?.trim() || empresa.nombre,
    headerImageUrl,
  });

  return {
    ok: true,
    html,
    subject: junta.titulo as string,
    from: fromAddress,
    recipients,
    asistentesCount: asistentes.length,
  };
}

export async function sendMinutaEmail(
  resendKey: string,
  payload: { html: string; subject: string; from: string; recipients: string[] }
): Promise<{ ok: true; emailId: string } | { ok: false; emailError: unknown }> {
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.recipients,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  const result = await emailRes.json();
  if (!emailRes.ok) return { ok: false, emailError: result };
  return { ok: true, emailId: result.id };
}
