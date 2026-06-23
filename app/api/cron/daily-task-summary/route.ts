/**
 * Daily task summary cron — un correo por (empleado, empresa).
 *
 * Schedule: every day at 13:00 UTC = 07:00 CST (see vercel.json).
 *
 * Delivery rules:
 *   - Un correo por empresa donde el empleado tiene tareas abiertas.
 *     El empleado con tareas en 2 empresas recibe 2 correos, cada uno branded
 *     con el header/logo/colores de esa empresa.
 *   - Primary destination: erp.empleados.email_empresa
 *   - Fallback: erp.personas.email
 *   - If both null → skip employee (logged)
 *   - Si el empleado tiene 0 tareas en alguna empresa → no se le manda correo de esa.
 *   - TASK_SUMMARY_TEST_TO env redirige TODOS los envíos a esa dirección,
 *     prefijando el subject con [TEST → Nombre] para iteración de plantilla.
 *
 * Rate limit: Resend free tier = 5 req/s. Metemos sleep(220ms) entre envíos
 * para quedar holgados bajo ese cap.
 *
 * Security: requiere `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron lo envía.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateTaskSummaryHtml,
  groupTasksByUrgency,
  type EmpresaBranding,
  type TaskSummaryItem,
} from '@/lib/task-summary-email';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';
import {
  buildComprasPorAutorizar,
  buildSolicitudesPorUsuario,
  type CompraPorAutorizar,
  type SolicitudPropia,
} from '@/lib/compras/avisos';

// 300s cap for cron — tolera crecimiento hasta ~1000 buckets con sleep(220ms)
// entre envíos y fetch a Resend. Si llegamos cerca del cap, migrar a Workflow
// con step-based execution.
export const maxDuration = 300;

/** PostgREST embedded select — empleado + persona viven en erp, OK embed. */
type EmbeddedTaskRow = {
  id: string;
  titulo: string;
  fecha_vence: string | null;
  fecha_compromiso: string | null;
  porcentaje_avance: number | null;
  empresa_id: string;
  empleado: {
    id: string;
    email_empresa: string | null;
    activo: boolean;
    persona: {
      nombre: string;
      apellido_paterno: string | null;
      email: string | null;
    } | null;
  } | null;
};

/** core.empresas row — branding para el correo. */
type EmpresaRow = {
  id: string;
  nombre: string;
  slug: string;
  header_email_url: string | null;
  logo_horizontal_light_url: string | null;
  logo_url: string | null;
  color_primario: string | null;
  color_primario_dark: string | null;
};

/** Un bucket por (empleado, empresa) → un correo. */
type Bucket = {
  key: string;
  empleadoId: string;
  empresaId: string;
  firstName: string;
  email: string;
  tasks: TaskSummaryItem[];
  /** Compras DILESA por autorizar (solo para Dirección/admin). */
  porAutorizar?: CompraPorAutorizar[];
  /** Solicitudes propias en curso (para el solicitante). */
  tusSolicitudes?: SolicitudPropia[];
};

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** Today (YYYY-MM-DD) in CST (UTC-6, no DST in Mexico since 2022). */
function getTodayCst(): string {
  const now = new Date();
  const cst = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return cst.toISOString().slice(0, 10);
}

/** Short Spanish date label: "22 abr". */
function formatSubjectDate(todayCst: string): string {
  const [, m, d] = todayCst.split('-');
  return `${parseInt(d, 10)} ${MONTHS_ES[parseInt(m, 10) - 1]}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBranding(row: EmpresaRow): EmpresaBranding {
  return {
    nombre: row.nombre,
    headerEmailUrl: row.header_email_url,
    logoHorizontalUrl: row.logo_horizontal_light_url,
    logoUrl: row.logo_url,
    colorPrimario: row.color_primario,
    colorPrimarioDark: row.color_primario_dark,
  };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const testToRaw = process.env.TASK_SUMMARY_TEST_TO?.trim().toLowerCase();
  const testTo = testToRaw && testToRaw.length > 0 ? testToRaw : null;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 });
  }
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });
  }

  const todayCst = getTodayCst();
  const subjectDate = formatSubjectDate(todayCst);
  const nowMs = Date.now();

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Iniciativa notificaciones-catalogo · S2: lee config runtime del catálogo
  // (slug global `task_summary_daily`). Si activo=false → skip todo el cron y
  // log 1 row con status=skipped (no logs per-bucket porque no se envió nada).
  // Fail-open: si def es null usa los defaults hardcoded de hoy.
  const def = await getDefinitionBySlug(supabase, 'task_summary_daily');
  if (def && !def.activo) {
    console.log('[daily-task-summary] def.activo=false — skip ciclo completo');
    await writeNotificationLog(supabase, {
      definitionId: def.id,
      status: 'skipped',
      recipients: { to: [] },
      subject: `task_summary_daily — skipped por kill switch`,
    });
    return NextResponse.json({ ok: true, skipped: true, reason: 'kill_switch' });
  }
  const subjectTemplate = def?.subject_template ?? null;
  const defExtras = def ? splitRecipientsExtra(def.recipients_extra) : { to: [], cc: [], bcc: [] };
  const defFromName = def?.from_name ?? null;
  const defReplyTo = def?.reply_to ?? null;

  // Whitelist de estados activos (ver fix #119). Fetch en paralelo de tasks y
  // empresas (cross-schema: empresa_id → core.empresas; PostgREST no hace joins
  // cross-schema en embeds, así que resolvemos con Map en memoria).
  const select =
    'id,titulo,fecha_vence,fecha_compromiso,porcentaje_avance,empresa_id,' +
    'empleado:asignado_a(id,email_empresa,activo,persona:persona_id(nombre,apellido_paterno,email))';

  const [tasksRes, empresasRes] = await Promise.all([
    supabase
      .schema('erp')
      .from('tasks')
      .select(select)
      .in('estado', ['pendiente', 'en_progreso', 'bloqueado'])
      .is('fecha_completado', null)
      .not('asignado_a', 'is', null)
      .returns<EmbeddedTaskRow[]>(),
    supabase
      .schema('core')
      .from('empresas')
      .select(
        'id,nombre,slug,header_email_url,logo_horizontal_light_url,logo_url,color_primario,color_primario_dark'
      )
      .returns<EmpresaRow[]>(),
  ]);

  if (tasksRes.error || !tasksRes.data) {
    console.error('[daily-task-summary] Tasks query failed:', tasksRes.error);
    return NextResponse.json(
      { error: 'Tasks query failed', detail: tasksRes.error?.message ?? 'unknown' },
      { status: 500 }
    );
  }
  if (empresasRes.error || !empresasRes.data) {
    console.error('[daily-task-summary] Empresas query failed:', empresasRes.error);
    return NextResponse.json(
      { error: 'Empresas query failed', detail: empresasRes.error?.message ?? 'unknown' },
      { status: 500 }
    );
  }

  const rows = tasksRes.data;
  const empresaMap = new Map<string, EmpresaRow>(empresasRes.data.map((e) => [e.id, e]));

  // Bucket por (empleado, empresa): un correo por pareja.
  const buckets = new Map<string, Bucket>();
  let skippedNoEmail = 0;
  let skippedInactive = 0;
  let skippedNoEmpresa = 0;

  for (const row of rows) {
    const empleado = row.empleado;
    if (!empleado) continue;
    if (!empleado.activo) {
      skippedInactive++;
      continue;
    }
    if (!empresaMap.has(row.empresa_id)) {
      skippedNoEmpresa++;
      continue;
    }

    const email = (empleado.email_empresa ?? empleado.persona?.email ?? '').trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    const firstName = empleado.persona?.nombre?.trim() || 'colega';

    const task: TaskSummaryItem = {
      id: row.id,
      titulo: row.titulo,
      fechaVence: row.fecha_vence,
      fechaCompromiso: row.fecha_compromiso,
      porcentajeAvance: row.porcentaje_avance ?? 0,
    };

    const key = `${empleado.id}:${row.empresa_id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.tasks.push(task);
    } else {
      buckets.set(key, {
        key,
        empleadoId: empleado.id,
        empresaId: row.empresa_id,
        firstName,
        email,
        tasks: [task],
      });
    }
  }

  // ── Compras DILESA (iniciativa dilesa-compras-flujo · S2, D6) ──────────────
  // "Compras por autorizar" → para Dirección/admin (cotizaciones listas para
  // adjudicar). "Tus solicitudes" → para quien las creó. Se fusiona a los
  // buckets por email; Dirección recibe correo aunque no tenga tareas.
  const dilesaRow = empresasRes.data.find((e) => e.slug === 'dilesa');
  if (dilesaRow) {
    const dilesaId = dilesaRow.id;
    const erp = supabase.schema('erp');
    const core = supabase.schema('core');

    const cotsRaw =
      (
        await erp
          .from('cotizaciones')
          .select('id, codigo, descripcion, creado_por, created_at, estado')
          .eq('empresa_id', dilesaId)
          .in('estado', ['abierta', 'comparada'])
          .is('cancelada_at', null)
          .is('deleted_at', null)
          .returns<
            {
              id: string;
              codigo: string;
              descripcion: string | null;
              creado_por: string | null;
              created_at: string | null;
              estado: string | null;
            }[]
          >()
      ).data ?? [];
    const cotIds = cotsRaw.map((c) => c.id);

    const lineasByCot = new Map<string, { partida_id: string | null }[]>();
    const provByCot = new Map<string, { estado: string | null; monto_total: number | null }[]>();
    if (cotIds.length) {
      const lins =
        (
          await erp
            .from('cotizacion_lineas')
            .select('cotizacion_id, partida_id')
            .in('cotizacion_id', cotIds)
            .returns<{ cotizacion_id: string; partida_id: string | null }[]>()
        ).data ?? [];
      for (const l of lins) {
        const arr = lineasByCot.get(l.cotizacion_id) ?? [];
        arr.push({ partida_id: l.partida_id });
        lineasByCot.set(l.cotizacion_id, arr);
      }
      const provs =
        (
          await erp
            .from('cotizacion_proveedores')
            .select('cotizacion_id, estado, monto_total')
            .in('cotizacion_id', cotIds)
            .returns<
              { cotizacion_id: string; estado: string | null; monto_total: number | null }[]
            >()
        ).data ?? [];
      for (const p of provs) {
        const arr = provByCot.get(p.cotizacion_id) ?? [];
        arr.push({ estado: p.estado, monto_total: p.monto_total });
        provByCot.set(p.cotizacion_id, arr);
      }
    }

    const reqsRaw =
      (
        await erp
          .from('requisiciones')
          .select('id, codigo, justificacion, solicitante_id, created_at')
          .eq('empresa_id', dilesaId)
          .is('cancelada_at', null)
          .is('deleted_at', null)
          .returns<
            {
              id: string;
              codigo: string;
              justificacion: string | null;
              solicitante_id: string | null;
              created_at: string | null;
            }[]
          >()
      ).data ?? [];

    const ocsRaw =
      (
        await erp
          .from('ordenes_compra')
          .select('requisicion_id, estado')
          .eq('empresa_id', dilesaId)
          .is('deleted_at', null)
          .not('requisicion_id', 'is', null)
          .returns<{ requisicion_id: string | null; estado: string | null }[]>()
      ).data ?? [];
    const reqConOc = new Set(
      ocsRaw
        .filter((o) => o.estado !== 'cancelada' && o.requisicion_id)
        .map((o) => o.requisicion_id as string)
    );

    // Lookups: partida → concepto/proyecto, proyecto → nombre, usuario → nombre/email.
    const partidaIds = [
      ...new Set(
        cotsRaw.flatMap((c) =>
          (lineasByCot.get(c.id) ?? [])
            .map((l) => l.partida_id)
            .filter((x): x is string => Boolean(x))
        )
      ),
    ];
    const partidaMap = new Map<
      string,
      { conceptoTexto: string | null; proyectoId: string | null }
    >();
    let proyectoIds: string[] = [];
    if (partidaIds.length) {
      const parts =
        (
          await erp
            .from('presupuesto_partidas')
            .select('id, concepto_texto, proyecto_id')
            .in('id', partidaIds)
            .returns<{ id: string; concepto_texto: string | null; proyecto_id: string | null }[]>()
        ).data ?? [];
      for (const p of parts)
        partidaMap.set(p.id, { conceptoTexto: p.concepto_texto, proyectoId: p.proyecto_id });
      proyectoIds = [
        ...new Set(parts.map((p) => p.proyecto_id).filter((x): x is string => Boolean(x))),
      ];
    }
    const proyectoMap = new Map<string, string>();
    if (proyectoIds.length) {
      const proys =
        (
          await supabase
            .schema('dilesa')
            .from('proyectos')
            .select('id, nombre')
            .in('id', proyectoIds)
            .returns<{ id: string; nombre: string | null }[]>()
        ).data ?? [];
      for (const p of proys) if (p.nombre) proyectoMap.set(p.id, p.nombre);
    }

    const userIds = [
      ...new Set(
        [...cotsRaw.map((c) => c.creado_por), ...reqsRaw.map((r) => r.solicitante_id)].filter(
          (x): x is string => Boolean(x)
        )
      ),
    ];
    const userNameMap = new Map<string, string>();
    const userEmailMap = new Map<string, string>();
    if (userIds.length) {
      const us =
        (
          await core
            .from('usuarios')
            .select('id, first_name, email')
            .in('id', userIds)
            .returns<{ id: string; first_name: string | null; email: string | null }[]>()
        ).data ?? [];
      for (const u of us) {
        userNameMap.set(u.id, u.first_name?.trim() || '—');
        if (u.email) userEmailMap.set(u.id, u.email);
      }
    }

    const porAutorizar = buildComprasPorAutorizar(
      cotsRaw.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        descripcion: c.descripcion,
        creado_por: c.creado_por,
        created_at: c.created_at,
        lineas: lineasByCot.get(c.id) ?? [],
        proveedores: provByCot.get(c.id) ?? [],
      })),
      { partida: partidaMap, proyecto: proyectoMap, usuario: userNameMap },
      nowMs
    );
    const solicitudesPorUsuario = buildSolicitudesPorUsuario(
      reqsRaw.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        justificacion: r.justificacion,
        solicitante_id: r.solicitante_id,
        created_at: r.created_at,
        conOc: reqConOc.has(r.id),
      })),
      cotsRaw.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        descripcion: c.descripcion,
        creado_por: c.creado_por,
        created_at: c.created_at,
        estado: c.estado,
      })),
      nowMs
    );

    // Destinatarios de "por autorizar": Dirección de DILESA + admins globales.
    const dirRoles =
      (
        await core
          .from('roles')
          .select('id')
          .eq('empresa_id', dilesaId)
          .ilike('nombre', 'direcci%n')
          .returns<{ id: string }[]>()
      ).data ?? [];
    let direccionUserIds: string[] = [];
    if (dirRoles.length) {
      const asgs =
        (
          await core
            .from('usuarios_empresas')
            .select('usuario_id')
            .eq('empresa_id', dilesaId)
            .eq('activo', true)
            .in(
              'rol_id',
              dirRoles.map((r) => r.id)
            )
            .returns<{ usuario_id: string }[]>()
        ).data ?? [];
      direccionUserIds = asgs.map((a) => a.usuario_id);
    }
    const adminRows =
      (
        await core
          .from('usuarios')
          .select('id')
          .eq('rol', 'admin')
          .eq('activo', true)
          .returns<{ id: string }[]>()
      ).data ?? [];
    const autorizadorIds = [...new Set([...direccionUserIds, ...adminRows.map((a) => a.id)])];
    const autorizadores: { id: string; email: string; firstName: string }[] = [];
    if (autorizadorIds.length) {
      const us =
        (
          await core
            .from('usuarios')
            .select('id, email, first_name, activo')
            .in('id', autorizadorIds)
            .returns<
              { id: string; email: string | null; first_name: string | null; activo: boolean }[]
            >()
        ).data ?? [];
      for (const u of us)
        if (u.activo && u.email)
          autorizadores.push({
            id: u.id,
            email: u.email,
            firstName: u.first_name?.trim() || 'colega',
          });
    }

    // Fusión por email (un correo por persona·empresa); crea bucket si Dirección
    // no tenía tareas.
    const bucketByEmailEmpresa = new Map<string, Bucket>();
    for (const b of buckets.values())
      bucketByEmailEmpresa.set(`${b.email.toLowerCase()}:${b.empresaId}`, b);
    const ensureBucket = (email: string, firstName: string, usuarioId: string): Bucket => {
      const k = `${email.toLowerCase()}:${dilesaId}`;
      let b = bucketByEmailEmpresa.get(k);
      if (!b) {
        b = {
          key: `usuario:${usuarioId}:${dilesaId}`,
          empleadoId: `usuario:${usuarioId}`,
          empresaId: dilesaId,
          firstName,
          email,
          tasks: [],
        };
        buckets.set(b.key, b);
        bucketByEmailEmpresa.set(k, b);
      }
      return b;
    };

    if (porAutorizar.length) {
      for (const a of autorizadores) {
        ensureBucket(a.email, a.firstName, a.id).porAutorizar = porAutorizar;
      }
    }
    for (const [usuarioId, items] of solicitudesPorUsuario) {
      const email = userEmailMap.get(usuarioId);
      if (!email) continue;
      ensureBucket(email, userNameMap.get(usuarioId) || 'colega', usuarioId).tusSolicitudes = items;
    }
  }

  // Envío serializado con sleep 220ms → ≤5 req/s. Resend free = 5/s.
  let sent = 0;
  let failed = 0;
  const failures: Array<{ empleadoId: string; empresaId: string; email: string; error: string }> =
    [];
  const previews: Array<{
    empleadoId: string;
    empresaSlug: string;
    to: string;
    total: number;
    subject: string;
    fromName: string;
  }> = [];

  let firstSend = true;
  for (const bucket of buckets.values()) {
    if (bucket.tasks.length === 0 && !bucket.porAutorizar?.length && !bucket.tusSolicitudes?.length)
      continue;

    const empresaRow = empresaMap.get(bucket.empresaId);
    if (!empresaRow) continue; // already filtered above, defensive
    const branding = toBranding(empresaRow);

    const groups = groupTasksByUrgency(bucket.tasks, todayCst);
    const html = generateTaskSummaryHtml(bucket.firstName, groups, todayCst, branding, {
      porAutorizar: bucket.porAutorizar,
      tusSolicitudes: bucket.tusSolicitudes,
    });

    // Nombre del from: usa override de la definition si tiene, si no usa el
    // nombre de la empresa (comportamiento legacy: branding per-empresa).
    const fromName = defFromName ?? empresaRow.nombre;
    const destination = testTo ?? bucket.email;
    // Subject: usa template editable de la definition (con vars empresa/fecha/firstName)
    // o fallback al subject hardcoded de hoy.
    const baseSubject = subjectTemplate
      ? renderSubject(subjectTemplate, {
          empresa: empresaRow.nombre,
          fecha: subjectDate,
          firstName: bucket.firstName,
        })
      : `Tareas de hoy en ${empresaRow.nombre} — ${subjectDate}`;
    const subject = testTo ? `[TEST → ${bucket.firstName}] ${baseSubject}` : baseSubject;
    const toList = [destination, ...defExtras.to];

    if (!firstSend) {
      await sleep(220);
    }
    firstSend = false;

    const resendBody: Record<string, unknown> = {
      from: `${fromName} <noreply@bsop.io>`,
      to: toList,
      subject,
      html,
    };
    if (defReplyTo) resendBody.reply_to = defReplyTo;
    if (defExtras.cc.length) resendBody.cc = defExtras.cc;
    if (defExtras.bcc.length) resendBody.bcc = defExtras.bcc;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('[daily-task-summary] Resend failed:', bucket.email, err);
      failed++;
      failures.push({
        empleadoId: bucket.empleadoId,
        empresaId: bucket.empresaId,
        email: bucket.email,
        error: err,
      });
      await writeNotificationLog(supabase, {
        definitionId: def?.id ?? null,
        empresaId: bucket.empresaId,
        status: 'failed',
        recipients: { to: toList, cc: defExtras.cc, bcc: defExtras.bcc },
        subject,
        errorMessage: `Resend ${resendRes.status}: ${err.slice(0, 800)}`,
        context: { empleadoId: bucket.empleadoId, totalTasks: bucket.tasks.length },
      });
      continue;
    }

    const sendJson = (await resendRes.json().catch(() => null)) as { id?: string } | null;
    sent++;
    previews.push({
      empleadoId: bucket.empleadoId,
      empresaSlug: empresaRow.slug,
      to: destination,
      total: bucket.tasks.length,
      subject,
      fromName,
    });
    await writeNotificationLog(supabase, {
      definitionId: def?.id ?? null,
      empresaId: bucket.empresaId,
      status: 'sent',
      recipients: { to: toList, cc: defExtras.cc, bcc: defExtras.bcc },
      subject,
      resendId: sendJson?.id ?? null,
      context: { empleadoId: bucket.empleadoId, totalTasks: bucket.tasks.length },
    });
  }

  const summary = {
    ok: true,
    todayCst,
    totalTasks: rows.length,
    bucketsWithTasks: buckets.size,
    sent,
    failed,
    skippedNoEmail,
    skippedInactive,
    skippedNoEmpresa,
    testMode: Boolean(testTo),
    testTo,
    failures: failures.length > 0 ? failures : undefined,
    previews: testTo ? previews : undefined,
  };

  console.log('[daily-task-summary]', JSON.stringify(summary));
  return NextResponse.json(summary);
}
