/**
 * POST /api/dilesa/ventas/[id]/notify-escrituracion
 *
 * Envía el correo "📜 Escrituración …" al cliente (+ vendedor en CC +
 * extras del catálogo, típicamente escrituras@dilesa.mx) cuando se cierra
 * la Fase 11 — Escriturada. Reemplaza el correo equivalente de Coda.
 *
 * Body (opcional):
 *   { resend?: boolean; test?: boolean }
 *   - sin flags → disparo automático post-captura. Idempotente vía
 *     `dilesa.ventas.notif_escrituracion_at` (si ya se envió, no re-envía).
 *   - resend: true → reenvío manual desde el expediente (ignora la
 *     idempotencia, actualiza el timestamp).
 *   - test: true → manda SOLO al email del usuario autenticado con subject
 *     "[PRUEBA] …" y NO toca el timestamp. Para validar el template con
 *     datos reales sin tocar al cliente.
 *
 * Config runtime: `core.notification_definitions` slug `dilesa_escrituracion`
 * (kill switch, from/reply-to, subject template, recipients extra). FAIL-OPEN
 * a los fallbacks hardcoded de lib/dilesa/escrituracion-emails si el catálogo
 * no responde. Cada intento se registra en `core.notification_log`.
 *
 * Security: sesión Supabase válida; la venta se lee con la sesión del
 * usuario para que la RLS decida el acceso (patrón notify-solicitud-avaluo).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  ESCRITURACION_EXTRA_TO_FALLBACK,
  ESCRITURACION_FROM_FALLBACK,
  ESCRITURACION_REPLY_TO_FALLBACK,
  ESCRITURACION_SLUG,
  ESCRITURACION_SUBJECT_FALLBACK,
  sendEscrituracionEmail,
  type EscrituracionDelivery,
  type EscrituracionEmailContext,
} from '@/lib/dilesa/escrituracion-emails';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VentaRow {
  id: string;
  empresa_id: string;
  unidad_id: string | null;
  persona_id: string;
  vendedor_usuario_id: string | null;
  notario_id: string | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  valor_escrituracion: number | null;
  notif_escrituracion_at: string | null;
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
  const body = (await req.json().catch(() => ({}))) as { resend?: boolean; test?: boolean };
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

  // Lectura de la venta con la sesión del usuario — la RLS decide acceso.
  const { data: v, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, notario_id, numero_escritura, fecha_escritura, valor_escrituracion, notif_escrituracion_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (vErr || !v) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }
  const venta = v as unknown as VentaRow;

  if (!venta.fecha_escritura) {
    return NextResponse.json(
      { ok: false, error: 'La venta aún no tiene fecha de escritura (captura la Fase 11).' },
      { status: 400 }
    );
  }

  // El correo solo tiene sentido con la fase cerrada (el disparo automático
  // llega justo después del INSERT de venta_fases, así que ya existe).
  const { data: f11 } = await sb
    .schema('dilesa')
    .from('venta_fases')
    .select('id')
    .eq('venta_id', venta.id)
    .eq('posicion', 11)
    .is('deleted_at', null)
    .maybeSingle();
  if (!f11) {
    return NextResponse.json(
      { ok: false, error: 'La Fase 11 (Escriturada) no está cerrada.' },
      { status: 400 }
    );
  }

  // Idempotencia del disparo automático.
  if (venta.notif_escrituracion_at && !isResend && !isTest) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  // Lookups cross-schema con admin (solo lectura para componer el email).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const [{ data: persona }, { data: vendedor }, { data: unidad }, { data: notario }] =
    await Promise.all([
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email')
        .eq('id', venta.persona_id)
        .maybeSingle(),
      venta.vendedor_usuario_id
        ? admin
            .schema('core')
            .from('usuarios')
            .select('first_name, last_name, email')
            .eq('id', venta.vendedor_usuario_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      venta.unidad_id
        ? admin
            .schema('dilesa')
            .from('unidades')
            .select(
              'identificador, proyecto_id, producto_id, calle, numero_oficial, area_m2, m2_construccion'
            )
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      venta.notario_id
        ? admin
            .schema('erp')
            .from('personas')
            .select('nombre, apellido_paterno, apellido_materno, telefono, email')
            .eq('id', venta.notario_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  let proyectoNombre: string | null = null;
  let prototipoSufijo: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: proyecto } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = proyecto?.nombre ?? null;
  }
  if (unidad?.producto_id) {
    const { data: producto } = await admin
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', unidad.producto_id)
      .maybeSingle();
    prototipoSufijo = producto?.nombre ? (producto.nombre.split('-').pop() ?? null) : null;
  }

  const clienteNombre = (persona ? nombreCompleto(persona) : '') || '(sin nombre)';
  const clienteEmail = (persona?.email as string | null)?.trim() || null;
  const vendedorEmail = (vendedor?.email as string | null)?.trim() || null;
  const domicilioOficial =
    [unidad?.calle, unidad?.numero_oficial].filter(Boolean).join(' #').toUpperCase() || null;

  // Config runtime del catálogo (FAIL-OPEN a fallbacks hardcoded).
  const def = await getDefinitionBySlug(admin, ESCRITURACION_SLUG, venta.empresa_id);
  const subjectVars = {
    proyecto: proyectoNombre ?? 'DILESA',
    cliente: clienteNombre,
    identificador: unidad?.identificador ?? '',
  };
  let subject = renderSubject(def?.subject_template ?? ESCRITURACION_SUBJECT_FALLBACK, subjectVars);
  const from = def
    ? `${def.from_name ? `${def.from_name} ` : ''}<${def.from_email}>`
    : ESCRITURACION_FROM_FALLBACK;
  const replyTo = def ? def.reply_to : ESCRITURACION_REPLY_TO_FALLBACK;
  const extras = def
    ? splitRecipientsExtra(def.recipients_extra)
    : { to: ESCRITURACION_EXTRA_TO_FALLBACK, cc: [], bcc: [] };

  // Kill switch.
  if (def && !def.activo) {
    await writeNotificationLog(admin, {
      definitionId: def.id,
      empresaId: venta.empresa_id,
      status: 'skipped',
      recipients: { to: [] },
      subject,
      triggeredByUserId: user.id,
      context: { venta_id: venta.id, resend: isResend, test: isTest },
    });
    return NextResponse.json({
      ok: false,
      skipped: true,
      error: 'La notificación de escrituración está desactivada en /settings/notificaciones.',
    });
  }

  let delivery: EscrituracionDelivery;
  if (isTest) {
    // Prueba: SOLO al usuario autenticado, sin cliente/vendedor/extras.
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: 'Tu usuario no tiene email para la prueba.' },
        { status: 400 }
      );
    }
    subject = `[PRUEBA] ${subject}`;
    delivery = { from, replyTo, to: [user.email], cc: [], bcc: [], subject };
  } else {
    if (!clienteEmail) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'El cliente no tiene email registrado. Captúralo en su expediente y usa "Reenviar correo".',
        },
        { status: 400 }
      );
    }
    const to = dedupEmails([clienteEmail, ...extras.to]);
    const cc = dedupEmails([vendedorEmail, ...extras.cc]).filter(
      (e) => !to.some((t) => t.toLowerCase() === e.toLowerCase())
    );
    const bcc = dedupEmails(extras.bcc).filter(
      (e) =>
        !to.some((t) => t.toLowerCase() === e.toLowerCase()) &&
        !cc.some((c) => c.toLowerCase() === e.toLowerCase())
    );
    delivery = { from, replyTo, to, cc, bcc, subject };
  }

  const branding = await loadEmpresaBranding(admin, venta.empresa_id);
  const emailCtx: EscrituracionEmailContext = {
    branding,
    ventaId: venta.id,
    empresaId: venta.empresa_id,
    clienteNombre,
    proyectoNombre,
    unidadIdentificador: unidad?.identificador ?? null,
    areaM2: unidad?.area_m2 != null ? Number(unidad.area_m2) : null,
    prototipo: prototipoSufijo,
    m2Construccion: unidad?.m2_construccion != null ? Number(unidad.m2_construccion) : null,
    domicilioOficial,
    numeroEscritura: venta.numero_escritura,
    fechaEscritura: venta.fecha_escritura,
    valorEscrituracion:
      venta.valor_escrituracion != null ? Number(venta.valor_escrituracion) : null,
    notarioNombre: notario ? nombreCompleto(notario) || null : null,
    notarioTelefono: (notario?.telefono as string | null) ?? null,
    notarioEmail: (notario?.email as string | null) ?? null,
  };

  const res = await sendEscrituracionEmail(emailCtx, delivery);

  await writeNotificationLog(admin, {
    definitionId: def?.id ?? null,
    empresaId: venta.empresa_id,
    status: res.ok ? 'sent' : 'failed',
    recipients: { to: delivery.to, cc: delivery.cc, bcc: delivery.bcc },
    subject: delivery.subject,
    resendId: res.resendId,
    errorMessage: res.ok ? null : (res.error ?? 'send failed'),
    triggeredByUserId: user.id,
    context: { venta_id: venta.id, resend: isResend, test: isTest },
  });

  if (!res.ok) {
    return NextResponse.json({ ok: false, sentTo: [], error: res.error ?? 'send failed' });
  }

  // El timestamp solo refleja envíos reales al cliente (no pruebas).
  if (!isTest) {
    await admin
      .schema('dilesa')
      .from('ventas')
      .update({ notif_escrituracion_at: new Date().toISOString() })
      .eq('id', venta.id);
  }

  return NextResponse.json({ ok: true, sentTo: res.sentTo });
}
