/**
 * GET  /api/dilesa/estimaciones/[id]/pdf      → descarga el PDF
 * POST /api/dilesa/estimaciones/[id]/pdf      → envía PDF por email al contratista
 *
 * Iniciativa dilesa-estimaciones · Sprint 5.
 *
 * Auth: sesión Supabase. La RLS de `dilesa.estimaciones` decide si el
 * usuario puede leer la fila. Si no, 404.
 *
 * El POST acepta body opcional `{ to?: string; subject?: string }` —
 * por default usa `erp.personas.email` del contratista y un subject
 * generado. Esto permite re-enviar a un email distinto sin modificar
 * la persona en DB.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { EstimacionPDF, type EstimacionPdfData } from '@/lib/dilesa/pdf/estimacion';

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

function fmtFecha(s: string | null): string {
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Construye la data del PDF desde el row de estimación + lookups. */
async function buildPdfData(
  sb: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  estimacionId: string
): Promise<{ data?: EstimacionPdfData; contratistaEmail?: string | null; error?: string }> {
  const { data: estim, error: eErr } = await sb
    .schema('dilesa')
    .from('estimaciones')
    .select('*')
    .eq('id', estimacionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (eErr || !estim) return { error: 'Estimación no encontrada' };

  const [persRes, datosRes, etRes] = await Promise.all([
    sb
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno, rfc, email')
      .eq('id', estim.contratista_id as string)
      .maybeSingle(),
    sb
      .schema('dilesa')
      .from('contratistas_datos')
      .select('abreviacion')
      .eq('persona_id', estim.contratista_id as string)
      .is('deleted_at', null)
      .maybeSingle(),
    sb
      .schema('dilesa')
      .from('estimacion_tareas')
      .select('tarea_terminada_id, construccion_id, monto_calculado')
      .eq('estimacion_id', estim.id as string),
  ]);

  const persona = persRes.data;
  const datos = datosRes.data;
  const tareas = etRes.data ?? [];

  // Resolver nombres de obras + unidades + tareas (plantilla → catálogo).
  const construccionIds = [...new Set(tareas.map((t) => t.construccion_id as string))];
  const terminadaIds = [...new Set(tareas.map((t) => t.tarea_terminada_id as string))];

  const [cRes, ttRes, taCatRes] = await Promise.all([
    construccionIds.length
      ? sb
          .schema('dilesa')
          .from('construccion')
          .select('id, codigo, unidad_id')
          .in('id', construccionIds)
      : Promise.resolve({ data: [], error: null }),
    terminadaIds.length
      ? sb
          .schema('dilesa')
          .from('construccion_tareas_terminadas')
          .select('id, plantilla_tarea_id, fecha_terminada')
          .in('id', terminadaIds)
      : Promise.resolve({ data: [], error: null }),
    sb.schema('dilesa').from('tareas_construccion').select('id, nombre'),
  ]);

  const cMap = new Map<string, { codigo: string; unidad_id: string }>();
  const uidArr: string[] = [];
  for (const c of cRes.data ?? []) {
    cMap.set(c.id as string, { codigo: c.codigo as string, unidad_id: c.unidad_id as string });
    uidArr.push(c.unidad_id as string);
  }

  const { data: uRes } = uidArr.length
    ? await sb.schema('dilesa').from('unidades').select('id, identificador').in('id', uidArr)
    : { data: [] };
  const uMap = new Map<string, string>();
  for (const u of uRes ?? []) uMap.set(u.id as string, u.identificador as string);

  const ttMap = new Map<string, { plantilla_tarea_id: string; fecha_terminada: string | null }>();
  const plantillaIds: string[] = [];
  for (const tt of ttRes.data ?? []) {
    ttMap.set(tt.id as string, {
      plantilla_tarea_id: tt.plantilla_tarea_id as string,
      fecha_terminada: (tt.fecha_terminada as string | null) ?? null,
    });
    plantillaIds.push(tt.plantilla_tarea_id as string);
  }

  const { data: plRes } = plantillaIds.length
    ? await sb
        .schema('dilesa')
        .from('plantilla_tareas')
        .select('id, tarea_id')
        .in('id', [...new Set(plantillaIds)])
    : { data: [] };
  const plMap = new Map<string, string>();
  for (const p of plRes ?? []) plMap.set(p.id as string, p.tarea_id as string);

  const tareaCatMap = new Map<string, string>();
  for (const t of taCatRes.data ?? []) tareaCatMap.set(t.id as string, t.nombre as string);

  // Agrupar por obra.
  const grupos = new Map<
    string,
    {
      unidad: string;
      construccionCodigo: string;
      tareas: EstimacionPdfData['obras'][number]['tareas'];
      subtotal: number;
    }
  >();
  for (const et of tareas) {
    const c = cMap.get(et.construccion_id as string);
    if (!c) continue;
    const tt = ttMap.get(et.tarea_terminada_id as string);
    const tareaId = tt ? plMap.get(tt.plantilla_tarea_id) : null;
    const nombre = tareaId
      ? (tareaCatMap.get(tareaId) ?? '(tarea desconocida)')
      : '(tarea desconocida)';
    const fecha = tt?.fecha_terminada ? fmtFecha(tt.fecha_terminada) : '—';
    const monto = Number(et.monto_calculado ?? 0);
    const cid = et.construccion_id as string;
    const grupo = grupos.get(cid) ?? {
      unidad: uMap.get(c.unidad_id) ?? '(sin unidad)',
      construccionCodigo: c.codigo,
      tareas: [],
      subtotal: 0,
    };
    grupo.tareas.push({ nombre, fechaTerminada: fecha, monto });
    grupo.subtotal += monto;
    grupos.set(cid, grupo);
  }

  const obras = [...grupos.values()]
    .map((g) => ({
      ...g,
      tareas: g.tareas.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }))
    .sort((a, b) => a.unidad.localeCompare(b.unidad));

  const contratistaNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';

  const data: EstimacionPdfData = {
    codigo: estim.codigo as string,
    fechaCierreTexto: fmtFecha(estim.fecha_cierre as string),
    fechaPagoTexto: fmtFecha(estim.fecha_pago_programado as string),
    contratista: {
      nombre: contratistaNombre,
      abreviacion: (datos?.abreviacion as string | null) ?? null,
      rfc: (persona?.rfc as string | null) ?? null,
      email: (persona?.email as string | null) ?? null,
    },
    obras,
    montoBruto: Number(estim.monto_bruto ?? 0),
    retencionPct: Number(estim.retencion_pct ?? 5),
    retencionMonto: Number(estim.retencion_monto ?? 0),
    montoNeto: Number(estim.monto_neto ?? 0),
  };

  return { data, contratistaEmail: (persona?.email as string | null) ?? null };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const buf = await renderToBuffer(<EstimacionPDF data={result.data} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="estimacion-${result.data.codigo}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
  };

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
          'El contratista no tiene email registrado. Pasa el destinatario en el body { "to": "email@..." }.',
      },
      { status: 400 }
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 });
  }

  const buf = await renderToBuffer(<EstimacionPDF data={data} />);
  const base64 = buf.toString('base64');

  const subject =
    body.subject?.trim() ||
    `Estimación ${data.codigo} · favor de emitir factura por $${data.montoNeto.toFixed(2)}`;

  const moneyFmt = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  });

  const html = `
<div style="font-family: -apple-system, sans-serif; color: #222; max-width: 600px;">
  <h2 style="color: #4a5d23;">Estimación ${data.codigo}</h2>
  <p>Hola ${data.contratista.abreviacion ?? data.contratista.nombre},</p>
  <p>
    Adjuntamos la estimación correspondiente al cierre del
    <strong>${data.fechaCierreTexto}</strong>. El monto neto a pagar es
    <strong style="color: #4a5d23; font-size: 18px;">${moneyFmt.format(data.montoNeto)}</strong>
    (bruto ${moneyFmt.format(data.montoBruto)} menos ${data.retencionPct.toFixed(2)}% de
    retención = ${moneyFmt.format(data.retencionMonto)}).
  </p>
  <p>
    Favor de emitir la factura por el monto neto a nombre de
    <strong>DESARROLLO INMOBILIARIO LOS ENCINOS, S.A. DE C.V.</strong>
    y enviarla a <a href="mailto:pagos@dilesa.mx">pagos@dilesa.mx</a>.
  </p>
  <p>
    El pago está programado para el <strong>${data.fechaPagoTexto}</strong>.
  </p>
  <p style="color: #666; font-size: 12px;">
    Cubre ${data.obras.reduce((s, o) => s + o.tareas.length, 0)} tareas terminadas
    en ${data.obras.length} obras. Detalle desglosado en el PDF adjunto.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
  <p style="color: #888; font-size: 11px;">
    DILESA · Desarrollo Inmobiliario Los Encinos<br/>
    pagos@dilesa.mx · (878) 791-1818
  </p>
</div>`.trim();

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'DILESA Pagos <pagos@dilesa.mx>',
      to: [to],
      subject,
      html,
      attachments: [
        {
          filename: `estimacion-${data.codigo}.pdf`,
          content: base64,
        },
      ],
    }),
  });
  const resJson = (await emailRes.json()) as { id?: string; message?: string };

  if (!emailRes.ok) {
    return NextResponse.json(
      { error: resJson.message ?? 'Error al enviar email', detail: resJson },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, emailId: resJson.id, sentTo: to });
}

export const runtime = 'nodejs';
