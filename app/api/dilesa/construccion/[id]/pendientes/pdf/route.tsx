/**
 * GET  /api/dilesa/construccion/[id]/pendientes/pdf  → abre el PDF (imprimir/guardar)
 * POST /api/dilesa/construccion/[id]/pendientes/pdf  → envía el PDF por email al contratista
 *
 * Relación de tareas pendientes de ejecución de una obra, con el valor de
 * mano de obra de cada tarea + datos de la vivienda y del contrato. Se le
 * entrega al contratista (a veces lo piden).
 *
 * Auth: sesión Supabase. La RLS de `dilesa.construccion` decide si el
 * usuario puede leer la obra; si no, 404.
 *
 * El POST acepta body opcional `{ to?: string; subject?: string }` — por
 * default usa `erp.personas.email` del contratista y un subject generado.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  TareasPendientesPDF,
  type TareasPendientesPdfData,
} from '@/lib/dilesa/pdf/tareas-pendientes';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';

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

function fmtFechaHoy(): string {
  const d = new Date();
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Construye la data del PDF desde la obra + sus tareas pendientes. */
async function buildPdfData(
  sb: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  construccionId: string
): Promise<{ data?: TareasPendientesPdfData; contratistaEmail?: string | null; error?: string }> {
  const { data: obra, error: oErr } = await sb
    .schema('dilesa')
    .from('construccion')
    .select(
      'id, codigo, unidad_id, producto_id, contratista_id, valor_contrato_mo, mo_ejecutado, avance_pct, m2_construccion'
    )
    .eq('id', construccionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (oErr || !obra) return { error: 'Obra no encontrada' };

  const valorContratoMo = Number(obra.valor_contrato_mo ?? 0);
  const moEjecutado = Number(obra.mo_ejecutado ?? 0);

  const [uRes, prodRes, persRes, datosRes, etRes, taCatRes, plRes, ttRes, clRes] =
    await Promise.all([
      sb
        .schema('dilesa')
        .from('unidades')
        .select('identificador, proyecto_id')
        .eq('id', obra.unidad_id as string)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('productos')
        .select('nombre')
        .eq('id', obra.producto_id as string)
        .maybeSingle(),
      sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email')
        .eq('id', obra.contratista_id as string)
        .maybeSingle(),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('abreviacion')
        .eq('persona_id', obra.contratista_id as string)
        .is('deleted_at', null)
        .maybeSingle(),
      sb.schema('dilesa').from('etapas_construccion').select('id, nombre, orden'),
      sb.schema('dilesa').from('tareas_construccion').select('id, nombre, hito_recepcion'),
      sb
        .schema('dilesa')
        .from('plantilla_tareas')
        .select('id, tarea_id, etapa_id, porcentaje_costo')
        .eq('producto_id', obra.producto_id as string)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('construccion_tareas_terminadas')
        .select('plantilla_tarea_id')
        .eq('construccion_id', construccionId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('contrato_lotes')
        .select('contrato_id')
        .eq('construccion_id', construccionId)
        .is('deleted_at', null),
    ]);

  // Proyecto del lote.
  let proyecto: string | null = null;
  const proyectoId = (uRes.data?.proyecto_id as string | null) ?? null;
  if (proyectoId) {
    const { data: prj } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', proyectoId)
      .maybeSingle();
    proyecto = (prj?.nombre as string | null) ?? null;
  }

  // Contrato(s) de obra ligados — referencia para el contratista. Solo los
  // del contratista de esta obra, vigentes.
  let contratoCodigo: string | null = null;
  const contratoIds = [...new Set((clRes.data ?? []).map((cl) => cl.contrato_id as string))];
  if (contratoIds.length) {
    const { data: ccRows } = await sb
      .schema('dilesa')
      .from('contratos_construccion')
      .select('codigo')
      .in('id', contratoIds)
      .eq('contratista_id', obra.contratista_id as string)
      .is('deleted_at', null)
      .is('cancelada_at', null);
    const codigos = [...new Set((ccRows ?? []).map((c) => c.codigo as string).filter(Boolean))];
    contratoCodigo = codigos.length ? codigos.join(', ') : null;
  }

  // Catálogos: etapa (orden/nombre) y tarea (nombre/hito).
  const etapaMap = new Map<string, { nombre: string; orden: number }>();
  for (const e of etRes.data ?? [])
    etapaMap.set(e.id as string, {
      nombre: e.nombre as string,
      orden: Number(e.orden ?? 0),
    });
  const tareaCatMap = new Map<string, { nombre: string; hito: string | null }>();
  for (const t of taCatRes.data ?? [])
    tareaCatMap.set(t.id as string, {
      nombre: t.nombre as string,
      hito: (t.hito_recepcion as string | null) ?? null,
    });

  const terminadasSet = new Set((ttRes.data ?? []).map((t) => t.plantilla_tarea_id as string));

  // Tareas pendientes de EJECUCIÓN: de la plantilla del prototipo, las que
  // no están terminadas y no son hito de recepción (esas las cierra el flujo
  // de recepción, no es trabajo del contratista). Valor = % × valor MO,
  // misma fórmula que la pantalla de la obra.
  const porEtapa = new Map<
    string,
    {
      nombre: string;
      orden: number;
      tareas: Array<{ nombre: string; valor: number }>;
      subtotal: number;
    }
  >();
  for (const p of plRes.data ?? []) {
    const cat = tareaCatMap.get(p.tarea_id as string);
    if (cat?.hito) continue;
    if (terminadasSet.has(p.id as string)) continue;
    const etapaId = p.etapa_id as string;
    const et = etapaMap.get(etapaId) ?? { nombre: '(sin etapa)', orden: 999 };
    const valor = Number(p.porcentaje_costo ?? 0) * valorContratoMo;
    const grupo = porEtapa.get(etapaId) ?? {
      nombre: et.nombre,
      orden: et.orden,
      tareas: [],
      subtotal: 0,
    };
    grupo.tareas.push({ nombre: cat?.nombre ?? '(tarea desconocida)', valor });
    grupo.subtotal += valor;
    porEtapa.set(etapaId, grupo);
  }

  const etapas = [...porEtapa.values()]
    .map((g) => ({ ...g, tareas: g.tareas.sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
    .sort((a, b) => a.orden - b.orden);
  const totalPendiente = etapas.reduce((s, e) => s + e.subtotal, 0);
  const totalTareas = etapas.reduce((s, e) => s + e.tareas.length, 0);

  // Identificador legible — mismo armado que la pantalla de la obra:
  // unidad + sufijo del prototipo (M13-L4 + RMC → M13-L4-RMC).
  const prototipo = (prodRes.data?.nombre as string | null) ?? null;
  const unidad = (uRes.data?.identificador as string | null) ?? null;
  const protoSufijo = prototipo ? prototipo.split('-').pop() : null;
  const identificador = unidad
    ? protoSufijo
      ? `${unidad}-${protoSufijo}`
      : unidad
    : (obra.codigo as string);

  const contratistaNombre =
    [persRes.data?.nombre, persRes.data?.apellido_paterno, persRes.data?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';

  const data: TareasPendientesPdfData = {
    obraCodigo: obra.codigo as string,
    identificador,
    fechaTexto: fmtFechaHoy(),
    proyecto,
    unidad,
    prototipo,
    m2Construccion: obra.m2_construccion != null ? Number(obra.m2_construccion) : null,
    contratista: {
      nombre: contratistaNombre,
      abreviacion: (datosRes.data?.abreviacion as string | null) ?? null,
    },
    contratoCodigo,
    avancePct: Number(obra.avance_pct ?? 0),
    valorContratoMo,
    moEjecutado,
    moPorEjecutar: valorContratoMo - moEjecutado,
    etapas,
    totalPendiente,
    totalTareas,
  };

  return { data, contratistaEmail: (persRes.data?.email as string | null) ?? null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const buf = await renderToBuffer(<TareasPendientesPDF data={result.data} />);
  const filename = `pendientes-${result.data.identificador.replace(/[^\w.-]+/g, '_')}.pdf`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // inline: abre en el visor del navegador para imprimir o guardar.
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { to?: string; subject?: string };

  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const data = result.data;

  const to = body.to?.trim() || result.contratistaEmail;
  if (!to) {
    return NextResponse.json(
      {
        error:
          'El contratista no tiene email registrado. Indica el destinatario en el campo de correo.',
      },
      { status: 400 }
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 });
  }

  // Iniciativa notificaciones-catalogo: config runtime + log post-envío.
  const def = await getDefinitionBySlug(sb, 'dilesa_tareas_pendientes');

  // Defaults hardcoded como fallback fail-open (si la def no existe aún).
  let fromAddress = 'DILESA Obra <noreply@bsop.io>';
  let replyTo: string | null = 'admin@dilesa.mx';
  let toList = [to];
  let ccList: string[] = [];
  let bccList: string[] = [];

  if (def) {
    if (!def.activo) {
      await writeNotificationLog(sb, {
        definitionId: def.id,
        status: 'skipped',
        recipients: { to: toList },
        subject: `dilesa_tareas_pendientes ${data.identificador} — kill switch`,
        context: { construccionId: id },
      });
      return NextResponse.json({ ok: true, skipped: true, reason: 'kill_switch' });
    }
    fromAddress = def.from_name ? `${def.from_name} <${def.from_email}>` : def.from_email;
    replyTo = def.reply_to;
    const extras = splitRecipientsExtra(def.recipients_extra);
    toList = [to, ...extras.to];
    ccList = extras.cc;
    bccList = extras.bcc;
  }

  const buf = await renderToBuffer(<TareasPendientesPDF data={data} />);
  const base64 = buf.toString('base64');

  const subject =
    body.subject?.trim() ||
    (def?.subject_template
      ? renderSubject(def.subject_template, {
          identificador: data.identificador,
          contratista: data.contratista.abreviacion ?? data.contratista.nombre,
        })
      : `Pendientes de obra ${data.identificador}`);

  const moneyFmt = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });

  const html = `
<div style="font-family: -apple-system, sans-serif; color: #222; max-width: 600px;">
  <h2 style="color: #4a5d23;">Pendientes de obra ${data.identificador}</h2>
  <p>Hola ${data.contratista.abreviacion ?? data.contratista.nombre},</p>
  <p>
    Adjuntamos la relación de <strong>tareas pendientes de ejecución</strong> de la obra
    <strong>${data.identificador}</strong>${data.proyecto ? ` (${data.proyecto})` : ''}.
    Son <strong>${data.totalTareas} ${data.totalTareas === 1 ? 'tarea' : 'tareas'}</strong>
    con un valor de mano de obra por ejecutar de
    <strong style="color: #4a5d23; font-size: 18px;">${moneyFmt.format(data.moPorEjecutar)}</strong>.
  </p>
  <p>
    El detalle por etapa, con el valor de mano de obra de cada tarea, está en el PDF adjunto.
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
    attachments: [
      {
        filename: `pendientes-${data.identificador.replace(/[^\w.-]+/g, '_')}.pdf`,
        content: base64,
      },
    ],
  };
  if (replyTo) resendBody.reply_to = replyTo;
  if (ccList.length) resendBody.cc = ccList;
  if (bccList.length) resendBody.bcc = bccList;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resendBody),
  });
  const resJson = (await emailRes.json()) as { id?: string; message?: string; name?: string };

  if (!emailRes.ok) {
    console.error('[construccion/pendientes POST] Resend rechazó el envío', {
      construccionId: id,
      to,
      status: emailRes.status,
      resendError: resJson,
    });
    await writeNotificationLog(sb, {
      definitionId: def?.id ?? null,
      status: 'failed',
      recipients: { to: toList, cc: ccList, bcc: bccList },
      subject,
      errorMessage: `Resend ${emailRes.status}: ${JSON.stringify(resJson).slice(0, 800)}`,
      context: { construccionId: id, identificador: data.identificador },
    });
    return NextResponse.json(
      { error: resJson.message ?? 'Error al enviar email', detail: resJson },
      { status: 500 }
    );
  }

  await writeNotificationLog(sb, {
    definitionId: def?.id ?? null,
    status: 'sent',
    recipients: { to: toList, cc: ccList, bcc: bccList },
    subject,
    resendId: resJson.id ?? null,
    context: { construccionId: id, identificador: data.identificador },
  });

  return NextResponse.json({ ok: true, emailId: resJson.id, sentTo: to });
}

export const runtime = 'nodejs';
