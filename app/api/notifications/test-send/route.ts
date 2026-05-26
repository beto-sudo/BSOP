/**
 * POST /api/notifications/test-send
 *
 * Iniciativa notificaciones-catalogo · Sprint 4. Admin-only.
 *
 * Manda un correo de prueba con datos DUMMY hardcodeados al email del
 * admin que invoca. Body: `{ slug: string }`.
 *
 * NO toca la lógica real del handler — usa un HTML minimal de muestra
 * con los overrides runtime aplicados desde el catálogo (D3 del planning
 * doc: test send con datos dummy, no reales, para evitar spam accidental
 * a clientes reales).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { slug?: string; empresaId?: string | null };
  if (!body.slug) {
    return NextResponse.json({ error: 'slug requerido' }, { status: 400 });
  }

  const userSupa = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'admin client unavailable' }, { status: 500 });
  }
  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 });
  }

  const def = await getDefinitionBySlug(admin, body.slug, body.empresaId ?? null);
  if (!def) {
    return NextResponse.json({ error: `slug "${body.slug}" no existe` }, { status: 404 });
  }

  // Test send IGNORA el kill switch activo=false a propósito — el admin
  // probablemente está probando cómo se ve un email apagado antes de
  // re-encenderlo.

  const adminEmail = guard.usuario.email;
  const fromAddress = def.from_name ? `${def.from_name} <${def.from_email}>` : def.from_email;
  // Dummy data hardcodeada — cubre las vars típicas de los 6 templates actuales.
  const dummyVars: Record<string, string> = {
    firstName: 'Admin',
    fecha: new Date().toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    empresa: 'Empresa Demo',
    codigo: 'EST-2026-TEST-001',
    junta_titulo: 'Junta de prueba',
  };
  const finalSubject = `[TEST] ${renderSubject(def.subject_template, dummyVars)}`;
  const extras = splitRecipientsExtra(def.recipients_extra);

  const html = `
<div style="font-family:-apple-system,sans-serif;color:#111;max-width:600px;padding:24px;">
  <div style="background:#fff3cd;border:1px solid #ffeeba;color:#856404;padding:12px;border-radius:6px;margin-bottom:16px;">
    <strong>⚠️ Este es un correo de PRUEBA</strong> disparado desde
    <code>/settings/notificaciones</code> por <code>${adminEmail}</code>.
    Contiene datos dummy. El HTML real del template
    <code>${def.slug}</code> vive en código y NO se previsualiza aquí —
    este test solo valida que los overrides runtime (from, reply_to,
    recipients_extra, subject) funcionen.
  </div>
  <h2>Test de notificación: <code>${def.slug}</code></h2>
  <table style="border-collapse:collapse;font-size:13px;margin-top:12px;">
    <tr><td style="padding:4px 12px 4px 0;color:#666">From:</td><td><code>${fromAddress}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Reply-to:</td><td><code>${def.reply_to ?? '—'}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Subject template:</td><td><code>${def.subject_template}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Subject renderizado:</td><td><code>${finalSubject}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Activo:</td><td>${def.activo ? '✓ Sí' : '✗ Apagado (kill switch)'}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Recipientes extra:</td><td>
      ${
        def.recipients_extra.length === 0
          ? '—'
          : def.recipients_extra
              .map((r) => `<div><code>[${r.type}]</code> ${r.email}</div>`)
              .join('')
      }
    </td></tr>
  </table>
  <p style="color:#888;font-size:11px;margin-top:24px">
    Enviado por BSOP · ${new Date().toISOString()}
  </p>
</div>`;

  const resendBody: Record<string, unknown> = {
    from: fromAddress,
    to: [adminEmail], // SOLO al admin que clickeó — nunca a recipients reales.
    subject: finalSubject,
    html,
  };
  if (def.reply_to) resendBody.reply_to = def.reply_to;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resendBody),
  });
  const resendJson = (await resendRes.json().catch(() => null)) as { id?: string } | null;

  if (!resendRes.ok) {
    await writeNotificationLog(admin, {
      definitionId: def.id,
      status: 'failed',
      recipients: { to: [adminEmail] },
      subject: finalSubject,
      errorMessage: `[TEST SEND] Resend ${resendRes.status}: ${JSON.stringify(resendJson).slice(0, 600)}`,
      triggeredByUserId: guard.usuario.id,
      context: { test_send: true, admin_email: adminEmail },
    });
    return NextResponse.json(
      { error: 'Resend rechazó el test send', detail: resendJson },
      { status: 500 }
    );
  }

  await writeNotificationLog(admin, {
    definitionId: def.id,
    status: 'sent',
    recipients: { to: [adminEmail] },
    subject: finalSubject,
    resendId: resendJson?.id ?? null,
    triggeredByUserId: guard.usuario.id,
    context: { test_send: true, admin_email: adminEmail },
  });

  // Mencionar extras solo informativamente — el test no los envía para no
  // disparar correos a soporte/comms con datos dummy.
  return NextResponse.json({
    ok: true,
    sentTo: adminEmail,
    resendId: resendJson?.id ?? null,
    extrasOmitted: extras,
  });
}
