/**
 * Daily task summary cron — sends each employee their pending tasks by email.
 *
 * Schedule: every day at 13:00 UTC = 07:00 CST (see vercel.json).
 *
 * Delivery rules:
 *   - Primary destination: erp.empleados.email_empresa
 *   - Fallback: erp.personas.email
 *   - If both null → skip employee (logged)
 *   - If employee has zero pending tasks → no email sent
 *   - If TASK_SUMMARY_TEST_TO env is set → all emails are redirected to that address
 *     (subject is prefixed with the original recipient name for clarity during testing)
 *
 * Security:
 *   - Requires `Authorization: Bearer ${CRON_SECRET}` header (Vercel Cron supplies this)
 *   - Rejects everything else with 401
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateTaskSummaryHtml,
  groupTasksByUrgency,
  type TaskSummaryItem,
} from '@/lib/task-summary-email';

// Types matching the PostgREST response shape for our embedded select
type EmbeddedTaskRow = {
  id: string;
  titulo: string;
  fecha_vence: string | null;
  fecha_compromiso: string | null;
  porcentaje_avance: number | null;
  empresa: { nombre: string; slug: string } | null;
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

type PerEmployeeBucket = {
  empleadoId: string;
  firstName: string;
  email: string;
  emailSource: 'empresa' | 'personal';
  tasks: TaskSummaryItem[];
};

/** Today (YYYY-MM-DD) in CST (UTC-6, no DST in Mexico since 2022). */
function getTodayCst(): string {
  const now = new Date();
  const cst = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return cst.toISOString().slice(0, 10);
}

/** Short Spanish date label for subject: "20 abr". */
function formatSubjectDate(todayCst: string): string {
  const months = [
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
  const [, m, d] = todayCst.split('-');
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const testTo = process.env.TASK_SUMMARY_TEST_TO?.toLowerCase() || null;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 });
  }
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });
  }

  const todayCst = getTodayCst();
  const subjectDate = formatSubjectDate(todayCst);

  // Fetch all open tasks with employee + company + person embedded.
  // Filters: estado not in completada/cancelada, fecha_completado IS NULL, has assignee.
  const select =
    'id,titulo,fecha_vence,fecha_compromiso,porcentaje_avance,' +
    'empresa:empresa_id(nombre,slug),' +
    'empleado:asignado_a(id,email_empresa,activo,persona:persona_id(nombre,apellido_paterno,email))';

  // Whitelist de estados activos (mismo criterio que components/inicio/mis-tareas-widget,
  // arreglado en #119 — el enum real es 'completado', no 'completada'). Whitelist > blacklist:
  // si mañana aparece 'archivado', 'pausado', etc. no se cuelan silenciosamente.
  const query = new URLSearchParams({
    select,
    estado: 'in.(pendiente,en_progreso,bloqueado)',
    fecha_completado: 'is.null',
    asignado_a: 'not.is.null',
  });

  // PostgREST: para GET contra un schema no-default, el header es Accept-Profile
  // (Content-Profile es para POST/PATCH/DELETE). Sin esto, PostgREST busca en
  // public.tasks y falla con PGRST205.
  const tasksRes = await fetch(`${supabaseUrl}/rest/v1/tasks?${query}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'erp',
    },
  });

  if (!tasksRes.ok) {
    const detail = await tasksRes.text();
    console.error('[daily-task-summary] Tasks query failed:', tasksRes.status, detail);
    return NextResponse.json({ error: 'Tasks query failed', detail }, { status: 500 });
  }

  const rows = (await tasksRes.json()) as EmbeddedTaskRow[];

  // Group by empleado_id, resolving email (empresa → personal fallback).
  const buckets = new Map<string, PerEmployeeBucket>();
  let skippedNoEmail = 0;
  let skippedInactive = 0;

  for (const row of rows) {
    const empleado = row.empleado;
    if (!empleado) continue;
    if (!empleado.activo) {
      skippedInactive++;
      continue;
    }

    const email = (empleado.email_empresa ?? empleado.persona?.email ?? '').trim();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    const emailSource: 'empresa' | 'personal' = empleado.email_empresa ? 'empresa' : 'personal';
    const firstName = empleado.persona?.nombre?.trim() || 'colega';

    const task: TaskSummaryItem = {
      id: row.id,
      titulo: row.titulo,
      empresaNombre: row.empresa?.nombre ?? 'Sin empresa',
      fechaVence: row.fecha_vence,
      fechaCompromiso: row.fecha_compromiso,
      porcentajeAvance: row.porcentaje_avance ?? 0,
    };

    const existing = buckets.get(empleado.id);
    if (existing) {
      existing.tasks.push(task);
    } else {
      buckets.set(empleado.id, {
        empleadoId: empleado.id,
        firstName,
        email,
        emailSource,
        tasks: [task],
      });
    }
  }

  // Send emails (serialized — Resend doesn't need parallel, keeps rate limit calm).
  let sent = 0;
  let failed = 0;
  const failures: Array<{ empleadoId: string; email: string; error: string }> = [];
  const previews: Array<{ empleadoId: string; to: string; total: number; subject: string }> = [];

  for (const bucket of buckets.values()) {
    if (bucket.tasks.length === 0) continue;

    const groups = groupTasksByUrgency(bucket.tasks, todayCst);
    const html = generateTaskSummaryHtml(bucket.firstName, groups, todayCst);

    // Test mode: redirect all sends to TASK_SUMMARY_TEST_TO, prefix subject with original name.
    const destination = testTo ?? bucket.email;
    const subject = testTo
      ? `[TEST → ${bucket.firstName}] Tareas de hoy — ${subjectDate}`
      : `Tareas de hoy — ${subjectDate}`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BSOP <noreply@bsop.io>',
        to: [destination],
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('[daily-task-summary] Resend failed:', bucket.email, err);
      failed++;
      failures.push({ empleadoId: bucket.empleadoId, email: bucket.email, error: err });
      continue;
    }

    sent++;
    previews.push({
      empleadoId: bucket.empleadoId,
      to: destination,
      total: bucket.tasks.length,
      subject,
    });
  }

  const summary = {
    ok: true,
    todayCst,
    totalTasks: rows.length,
    employeesWithTasks: buckets.size,
    sent,
    failed,
    skippedNoEmail,
    skippedInactive,
    testMode: Boolean(testTo),
    testTo,
    failures: failures.length > 0 ? failures : undefined,
    previews: testTo ? previews : undefined, // only surface previews in test mode
  };

  console.log('[daily-task-summary]', JSON.stringify(summary));
  return NextResponse.json(summary);
}
