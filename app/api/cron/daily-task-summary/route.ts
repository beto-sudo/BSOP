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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
    if (bucket.tasks.length === 0) continue;

    const empresaRow = empresaMap.get(bucket.empresaId);
    if (!empresaRow) continue; // already filtered above, defensive
    const branding = toBranding(empresaRow);

    const groups = groupTasksByUrgency(bucket.tasks, todayCst);
    const html = generateTaskSummaryHtml(bucket.firstName, groups, todayCst, branding);

    const fromName = empresaRow.nombre;
    const destination = testTo ?? bucket.email;
    const subject = testTo
      ? `[TEST → ${bucket.firstName}] Tareas de hoy en ${empresaRow.nombre} — ${subjectDate}`
      : `Tareas de hoy en ${empresaRow.nombre} — ${subjectDate}`;

    if (!firstSend) {
      await sleep(220);
    }
    firstSend = false;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <noreply@bsop.io>`,
        to: [destination],
        subject,
        html,
      }),
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
      continue;
    }

    sent++;
    previews.push({
      empleadoId: bucket.empleadoId,
      empresaSlug: empresaRow.slug,
      to: destination,
      total: bucket.tasks.length,
      subject,
      fromName,
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
