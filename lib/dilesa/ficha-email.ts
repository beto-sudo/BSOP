/**
 * Envío manual de la ficha comercial de un activo a un prospecto de
 * venta/renta (iniciativa `dilesa-portafolio-predios` · S7).
 *
 * SIEMPRE lo dispara un operador con confirmación explícita desde el
 * expediente — nunca automático. Pasa por el catálogo de notificaciones
 * (slug `dilesa_ficha_comercial`: kill switch, from, recipientes extra) y
 * queda en `notification_log`. FAIL-OPEN a defaults como el resto de las
 * libs de email. El PDF viaja como adjunto base64 (API de Resend).
 */

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  getDefinitionBySlug,
  overridesFromDefinition,
  writeNotificationLog,
  dedupEmails,
} from '@/lib/notifications';
import { escapeHtml } from './email-layout';

const RESEND_FROM = 'DILESA <noreply@bsop.io>';

export interface FichaEmailInput {
  empresaId: string;
  activoId: string;
  activoNombre: string;
  to: string[];
  subject: string;
  /** Mensaje en texto plano capturado por el operador (se escapa a HTML). */
  mensaje: string;
  pdf: Buffer;
  pdfFilename: string;
  /** Para el reply-to y la firma del correo. */
  operadorNombre: string | null;
  operadorEmail: string | null;
}

export async function sendFichaComercialEmail(
  input: FichaEmailInput
): Promise<{ ok: boolean; sentTo: string[]; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, sentTo: [], error: 'RESEND_API_KEY missing' };
  }

  const admin = getSupabaseAdminClient();
  const def = admin
    ? await getDefinitionBySlug(admin, 'dilesa_ficha_comercial', input.empresaId)
    : null;
  const { killed, definitionId, overrides } = overridesFromDefinition(def);

  if (killed) {
    if (admin) {
      await writeNotificationLog(admin, {
        definitionId,
        empresaId: input.empresaId,
        status: 'skipped',
        recipients: { to: [] },
        subject: input.subject,
        context: { activo_id: input.activoId },
      });
    }
    return { ok: false, sentTo: [], error: 'kill switch (dilesa_ficha_comercial desactivado)' };
  }

  const recipients = dedupEmails([...input.to, ...(overrides.extraTo ?? [])]);
  if (recipients.length === 0) {
    return { ok: false, sentTo: [], error: 'no recipients' };
  }
  const bccs = dedupEmails(overrides.extraBcc ?? []).filter(
    (b) => !recipients.some((r) => r.toLowerCase() === b.toLowerCase())
  );

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #333; max-width: 640px;">
      ${input.mensaje
        .split(/\n+/)
        .map((p) => `<p style="margin: 0 0 12px;">${escapeHtml(p)}</p>`)
        .join('')}
      <p style="margin: 16px 0 4px;">Adjuntamos la <b>ficha comercial de ${escapeHtml(input.activoNombre)}</b> con los datos del inmueble.</p>
      <p style="margin: 16px 0 0;">Saludos cordiales,<br/><b>${escapeHtml(input.operadorNombre ?? 'Equipo DILESA')}</b><br/>DILESA — Desarrollo Inmobiliario Los Encinos</p>
    </div>
  `.trim();

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: overrides.from ?? RESEND_FROM,
      to: recipients,
      bcc: bccs.length > 0 ? bccs : undefined,
      reply_to: overrides.replyTo ?? input.operadorEmail ?? undefined,
      subject: input.subject,
      html,
      attachments: [{ filename: input.pdfFilename, content: input.pdf.toString('base64') }],
    }),
  });
  const respId = resp.ok
    ? (((await resp.json().catch(() => null)) as { id?: string } | null)?.id ?? null)
    : null;

  if (admin) {
    await writeNotificationLog(admin, {
      definitionId,
      empresaId: input.empresaId,
      status: resp.ok ? 'sent' : 'failed',
      recipients: { to: recipients, bcc: bccs },
      subject: input.subject,
      resendId: respId,
      errorMessage: resp.ok ? null : `resend ${resp.status}`,
      context: { activo_id: input.activoId },
    });
  }

  if (!resp.ok) {
    return { ok: false, sentTo: recipients, error: `resend ${resp.status}` };
  }
  return { ok: true, sentTo: [...recipients, ...bccs] };
}
