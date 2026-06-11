/**
 * GET  /api/dilesa/cotizaciones/[id]/solicitud?proveedor=<cotProveedorId>
 *        → descarga el PDF de la Solicitud de Cotización (dirigido a ese proveedor).
 * POST /api/dilesa/cotizaciones/[id]/solicitud
 *        body { cotProveedorId: string; to?: string }
 *        → envía el PDF por email al proveedor (erp.personas.email) vía Resend.
 *
 * Iniciativa dilesa-compras · Sprint Cotizaciones. Auth: sesión Supabase; la RLS
 * de `erp.cotizaciones` decide si el usuario puede leer la fila.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  SolicitudCotizacionPDF,
  type SolicitudCotizacionData,
} from '@/lib/dilesa/pdf/solicitud-cotizacion';
import { getDefinitionBySlug, renderSubject, writeNotificationLog } from '@/lib/notifications';

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function buildPdfData(
  sb: Sb,
  cotizacionId: string,
  cotProveedorId: string | null
): Promise<{ data?: SolicitudCotizacionData; proveedorEmail?: string | null; error?: string }> {
  const { data: cot, error: cErr } = await sb
    .schema('erp')
    .from('cotizaciones')
    .select('id, codigo, tipo, fecha_limite, descripcion, created_at')
    .eq('id', cotizacionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !cot) return { error: 'Cotización no encontrada' };

  const { data: lineasRaw } = await sb
    .schema('erp')
    .from('cotizacion_lineas')
    .select('id, partida_id, descripcion, cantidad, unidad')
    .eq('cotizacion_id', cotizacionId);
  const lineas = lineasRaw ?? [];

  // Partidas → concepto_texto + proyecto_id.
  const partidaIds = [...new Set(lineas.map((l) => l.partida_id).filter(Boolean) as string[])];
  const { data: partidasRaw } = partidaIds.length
    ? await sb
        .schema('erp')
        .from('presupuesto_partidas')
        .select('id, concepto_texto, proyecto_id')
        .in('id', partidaIds)
    : { data: [] };
  const partidaMap = new Map<string, { concepto: string; proyectoId: string | null }>();
  for (const p of partidasRaw ?? []) {
    partidaMap.set(p.id as string, {
      concepto: (p.concepto_texto as string | null) ?? '—',
      proyectoId: (p.proyecto_id as string | null) ?? null,
    });
  }

  const proyectoId = [...partidaMap.values()].map((p) => p.proyectoId).filter(Boolean)[0] ?? null;
  const { data: proyecto } = proyectoId
    ? await sb
        .schema('dilesa')
        .from('proyectos')
        .select('nombre')
        .eq('id', proyectoId)
        .maybeSingle()
    : { data: null };

  // Proveedor destinatario (opcional).
  let proveedorNombre = '(general)';
  let proveedorEmail: string | null = null;
  if (cotProveedorId) {
    const { data: cp } = await sb
      .schema('erp')
      .from('cotizacion_proveedores')
      .select('proveedor_id')
      .eq('id', cotProveedorId)
      .maybeSingle();
    if (cp?.proveedor_id) {
      const { data: prov } = await sb
        .schema('erp')
        .from('proveedores')
        .select('persona_id')
        .eq('id', cp.proveedor_id as string)
        .maybeSingle();
      if (prov?.persona_id) {
        const { data: per } = await sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno, email')
          .eq('id', prov.persona_id as string)
          .maybeSingle();
        proveedorNombre =
          [per?.nombre, per?.apellido_paterno, per?.apellido_materno]
            .filter(Boolean)
            .join(' ')
            .trim() || '(sin nombre)';
        proveedorEmail = (per?.email as string | null) ?? null;
      }
    }
  }

  const data: SolicitudCotizacionData = {
    folio: (cot.codigo as string | null) ?? '—',
    fechaTexto: fmtFecha((cot.created_at as string | null)?.slice(0, 10)),
    proyecto: (proyecto?.nombre as string | null) ?? '—',
    tipoLabel: cot.tipo === 'obra' ? 'Obra (mano de obra)' : 'Materiales / servicios',
    fechaLimiteTexto: fmtFecha(cot.fecha_limite as string | null),
    proveedorNombre,
    descripcion: (cot.descripcion as string | null) ?? null,
    lineas: lineas.map((l) => ({
      concepto: l.partida_id
        ? (partidaMap.get(l.partida_id as string)?.concepto ?? '—')
        : ((l.descripcion as string | null) ?? 'Concepto libre'),
      descripcion: (l.descripcion as string | null) ?? '',
      cantidad: String(l.cantidad ?? ''),
      unidad: (l.unidad as string | null) ?? '',
    })),
  };

  return { data, proveedorEmail };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cotProveedorId = new URL(req.url).searchParams.get('proveedor');
  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id, cotProveedorId);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const buf = await renderToBuffer(<SolicitudCotizacionPDF data={result.data} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="solicitud-cotizacion-${result.data.folio}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { cotProveedorId?: string; to?: string };
  if (!body.cotProveedorId) {
    return NextResponse.json({ error: 'Falta cotProveedorId' }, { status: 400 });
  }

  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id, body.cotProveedorId);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const data = result.data;

  const to = body.to?.trim() || result.proveedorEmail;
  if (!to) {
    return NextResponse.json(
      {
        error:
          'El proveedor no tiene email registrado. Captúralo en el proveedor o pasa { "to": "email@..." }.',
      },
      { status: 400 }
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 });
  }

  // Catálogo de notificaciones (fail-open: sin definición usa defaults).
  const def = await getDefinitionBySlug(sb, 'dilesa_cotizacion');
  let fromAddress = 'DILESA Compras <noreply@bsop.io>';
  let replyTo: string | null = 'compras@dilesa.mx';
  const toList = [to];
  if (def) {
    if (!def.activo) {
      await writeNotificationLog(sb, {
        definitionId: def.id,
        status: 'skipped',
        recipients: { to: toList },
        subject: `dilesa_cotizacion ${data.folio} — kill switch`,
        context: { cotizacionId: id },
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'kill_switch' });
    }
    fromAddress = def.from_name ? `${def.from_name} <${def.from_email}>` : def.from_email;
    replyTo = def.reply_to;
  }

  const buf = await renderToBuffer(<SolicitudCotizacionPDF data={data} />);
  const base64 = buf.toString('base64');
  const subject = renderSubject(
    def?.subject_template ?? 'Solicitud de cotización {folio} — DILESA',
    {
      folio: data.folio,
    }
  );

  const html = `
<div style="font-family: -apple-system, sans-serif; color: #222; max-width: 600px;">
  <h2 style="color: #7d8043;">Solicitud de cotización ${data.folio}</h2>
  <p>Estimado proveedor (${data.proveedorNombre}),</p>
  <p>
    Por medio del presente le solicitamos su cotización para el proyecto
    <strong>${data.proyecto}</strong>. En el PDF adjunto encontrará el listado de conceptos a
    cotizar.
  </p>
  <p>
    Favor de indicar precio unitario, tiempo de entrega y condiciones de pago, y enviar su
    propuesta antes del <strong>${data.fechaLimiteTexto}</strong>.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
  <p style="color: #888; font-size: 11px;">
    DILESA · Desarrollo Inmobiliario Los Encinos<br/>
    dilesa.mx · (878) 791-1818
  </p>
</div>`.trim();

  const resendBody: Record<string, unknown> = {
    from: fromAddress,
    to: toList,
    subject,
    html,
    attachments: [{ filename: `solicitud-cotizacion-${data.folio}.pdf`, content: base64 }],
  };
  if (replyTo) resendBody.reply_to = replyTo;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendBody),
  });
  const resJson = (await emailRes.json()) as { id?: string; message?: string };

  if (!emailRes.ok) {
    console.error('[cotizaciones/solicitud POST] Resend rechazó el envío', {
      cotizacionId: id,
      to,
      status: emailRes.status,
      resendError: resJson,
    });
    await writeNotificationLog(sb, {
      definitionId: def?.id ?? null,
      status: 'failed',
      recipients: { to: toList },
      subject,
      errorMessage: `Resend ${emailRes.status}: ${JSON.stringify(resJson).slice(0, 800)}`,
      context: { cotizacionId: id, folio: data.folio },
    });
    return NextResponse.json(
      { error: resJson.message ?? 'Error al enviar email', detail: resJson },
      { status: 500 }
    );
  }

  await writeNotificationLog(sb, {
    definitionId: def?.id ?? null,
    status: 'sent',
    recipients: { to: toList },
    subject,
    resendId: resJson.id ?? null,
    context: { cotizacionId: id, folio: data.folio, cotProveedorId: body.cotProveedorId },
  });

  return NextResponse.json({ ok: true, emailId: resJson.id, sentTo: to });
}

export const runtime = 'nodejs';
