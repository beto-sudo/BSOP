/**
 * POST /api/rh/empleados/[id]/notify
 *
 * Envía el aviso de ALTA o BAJA de personal al comité de la empresa.
 * Continuación (Fase 2) de la iniciativa `notificaciones-catalogo`. Reemplaza
 * el correo que Coda mandaba al dar de alta / baja a un empleado.
 *
 * Body:
 *   { tipo: 'alta' | 'baja'; resend?: boolean; test?: boolean }
 *   - sin flags → disparo automático post-captura. Idempotente vía
 *     `erp.empleados.notif_alta_at` / `notif_baja_at` (si ya se envió, no
 *     re-envía).
 *   - resend: true → reenvío manual desde el expediente (ignora la
 *     idempotencia, actualiza el timestamp).
 *   - test: true → manda SOLO al email del usuario autenticado con subject
 *     "[PRUEBA] …" y NO toca el timestamp. Para validar el template sin tocar
 *     al comité.
 *
 * Config runtime: `core.notification_definitions` slugs `empleado_alta` /
 * `empleado_baja` por empresa (kill switch, from/reply-to, subject, recipients
 * extra). FAIL-OPEN a los fallbacks hardcoded de lib/rh/empleado-emails si el
 * catálogo no responde. Cada intento se registra en `core.notification_log`.
 *
 * Security: sesión Supabase válida; el empleado se lee con la sesión del
 * usuario para que la RLS decida el acceso (patrón notify-escrituracion).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';
import {
  EMPLEADO_EXTRA_TO_FALLBACK,
  EMPLEADO_FROM_FALLBACK,
  EMPLEADO_REPLY_TO_FALLBACK,
  empleadoSlug,
  empleadoSubjectFallback,
  sendEmpleadoAvisoEmail,
  type EmpleadoAvisoContext,
  type EmpleadoAvisoDelivery,
  type EmpleadoAvisoTipo,
} from '@/lib/rh/empleado-emails';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EmpleadoRow {
  id: string;
  empresa_id: string;
  persona_id: string;
  departamento_id: string | null;
  puesto_id: string | null;
  fecha_ingreso: string | null;
  fecha_baja: string | null;
  motivo_baja: string | null;
  tipo_contrato: string | null;
  lugar_trabajo: string | null;
  email_empresa: string | null;
  notif_alta_at: string | null;
  notif_baja_at: string | null;
}

function nombreCompleto(p: {
  nombre?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
}): string {
  return [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ').trim();
}

/** Dedup case-insensitive preservando el orden y el casing del primero. */
function dedupEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const v = e?.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    tipo?: string;
    resend?: boolean;
    test?: boolean;
  };
  const tipo = body.tipo as EmpleadoAvisoTipo;
  if (tipo !== 'alta' && tipo !== 'baja') {
    return NextResponse.json({ ok: false, error: 'tipo debe ser alta|baja' }, { status: 400 });
  }
  const isResend = body.resend === true;
  const isTest = body.test === true;

  // Auth: sesión válida.
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Lectura del empleado con la sesión del usuario — la RLS decide acceso.
  const { data: e, error: eErr } = await sb
    .schema('erp')
    .from('empleados')
    .select(
      'id, empresa_id, persona_id, departamento_id, puesto_id, fecha_ingreso, fecha_baja, motivo_baja, tipo_contrato, lugar_trabajo, email_empresa, notif_alta_at, notif_baja_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (eErr || !e) {
    return NextResponse.json({ ok: false, error: 'Empleado no encontrado' }, { status: 404 });
  }
  const empleado = e as unknown as EmpleadoRow;

  // Idempotencia del disparo automático.
  const yaEnviado = tipo === 'alta' ? empleado.notif_alta_at : empleado.notif_baja_at;
  if (yaEnviado && !isResend && !isTest) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  // Lookups cross-schema con admin (solo lectura para componer el email).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const [{ data: persona }, { data: puesto }, { data: departamento }, { data: empresa }] =
    await Promise.all([
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno')
        .eq('id', empleado.persona_id)
        .maybeSingle(),
      empleado.puesto_id
        ? admin
            .schema('erp')
            .from('puestos')
            .select('nombre')
            .eq('id', empleado.puesto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      empleado.departamento_id
        ? admin
            .schema('erp')
            .from('departamentos')
            .select('nombre')
            .eq('id', empleado.departamento_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .schema('core')
        .from('empresas')
        .select('nombre, nombre_comercial')
        .eq('id', empleado.empresa_id)
        .maybeSingle(),
    ]);

  const nombre = (persona ? nombreCompleto(persona) : '') || '(sin nombre)';
  const puestoNombre = (puesto?.nombre as string | null) ?? null;
  const empresaNombre =
    (empresa?.nombre_comercial as string | null)?.trim() ||
    (empresa?.nombre as string | null) ||
    'la empresa';

  // Config runtime del catálogo (FAIL-OPEN a fallbacks hardcoded).
  const slug = empleadoSlug(tipo);
  const def = await getDefinitionBySlug(admin, slug, empleado.empresa_id);
  const subjectVars = { nombre, puesto: puestoNombre ?? '—', empresa: empresaNombre };
  let subject = renderSubject(def?.subject_template ?? empleadoSubjectFallback(tipo), subjectVars);
  const from = def
    ? `${def.from_name ? `${def.from_name} ` : ''}<${def.from_email}>`
    : EMPLEADO_FROM_FALLBACK;
  const replyTo = def ? def.reply_to : EMPLEADO_REPLY_TO_FALLBACK;
  const extras = def
    ? splitRecipientsExtra(def.recipients_extra)
    : { to: EMPLEADO_EXTRA_TO_FALLBACK, cc: [], bcc: [] };

  // Kill switch.
  if (def && !def.activo) {
    await writeNotificationLog(admin, {
      definitionId: def.id,
      empresaId: empleado.empresa_id,
      status: 'skipped',
      recipients: { to: [] },
      subject,
      triggeredByUserId: user.id,
      context: { empleado_id: empleado.id, tipo, resend: isResend, test: isTest },
    });
    return NextResponse.json({
      ok: false,
      skipped: true,
      error: `El aviso de ${tipo} está desactivado en /settings/notificaciones.`,
    });
  }

  let delivery: EmpleadoAvisoDelivery;
  if (isTest) {
    // Prueba: SOLO al usuario autenticado, sin tocar al comité.
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: 'Tu usuario no tiene email para la prueba.' },
        { status: 400 }
      );
    }
    subject = `[PRUEBA] ${subject}`;
    delivery = { from, replyTo, to: [user.email], cc: [], bcc: [], subject };
  } else {
    const to = dedupEmails(extras.to);
    if (to.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No hay destinatarios configurados. Agrega el correo del comité en /settings/notificaciones.',
        },
        { status: 400 }
      );
    }
    const cc = dedupEmails(extras.cc).filter(
      (c) => !to.some((t) => t.toLowerCase() === c.toLowerCase())
    );
    const bcc = dedupEmails(extras.bcc).filter(
      (x) =>
        !to.some((t) => t.toLowerCase() === x.toLowerCase()) &&
        !cc.some((c) => c.toLowerCase() === x.toLowerCase())
    );
    delivery = { from, replyTo, to, cc, bcc, subject };
  }

  const branding = await loadEmpresaBranding(admin, empleado.empresa_id);
  const emailCtx: EmpleadoAvisoContext = {
    tipo,
    empleadoId: empleado.id,
    empresaId: empleado.empresa_id,
    nombre,
    puesto: puestoNombre,
    departamento: (departamento?.nombre as string | null) ?? null,
    empresaNombre,
    fechaIngreso: empleado.fecha_ingreso,
    tipoContrato: empleado.tipo_contrato,
    lugarTrabajo: empleado.lugar_trabajo,
    correoEmpresa: empleado.email_empresa,
    fechaBaja: empleado.fecha_baja,
    motivoBaja: empleado.motivo_baja,
    branding,
  };

  const res = await sendEmpleadoAvisoEmail(emailCtx, delivery);

  await writeNotificationLog(admin, {
    definitionId: def?.id ?? null,
    empresaId: empleado.empresa_id,
    status: res.ok ? 'sent' : 'failed',
    recipients: { to: delivery.to, cc: delivery.cc, bcc: delivery.bcc },
    subject: delivery.subject,
    resendId: res.resendId,
    errorMessage: res.ok ? null : (res.error ?? 'send failed'),
    triggeredByUserId: user.id,
    context: { empleado_id: empleado.id, tipo, resend: isResend, test: isTest },
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, sentTo: [], error: res.error ?? 'send failed' });
  }

  // El timestamp solo refleja envíos reales al comité (no pruebas).
  if (!isTest) {
    const nowIso = new Date().toISOString();
    const update = tipo === 'alta' ? { notif_alta_at: nowIso } : { notif_baja_at: nowIso };
    await admin.schema('erp').from('empleados').update(update).eq('id', empleado.id);
  }

  return NextResponse.json({ ok: true, sentTo: res.sentTo });
}
