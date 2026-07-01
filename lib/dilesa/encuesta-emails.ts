/**
 * Emails del ciclo de Encuesta de Conformidad posventa (Fase 16).
 *
 * Iniciativa `dilesa-ventas-expediente` · S5 final.
 *
 * 4 eventos:
 *  - `inicial`      → D+2 de la entrega: invitación con la liga.
 *  - `recordatorio` → +1 día sin respuesta.
 *  - `ultimo`       → +1 día más: último aviso.
 *  - aviso interno  → al agotar intentos, correo a Gerencia/Atención a
 *    Clientes con la liga a la captura manual.
 *
 * Mismo patrón que avaluo-emails: Resend vía fetch, fallo NO bloquea
 * (console.warn), branding por empresa.
 */

import { renderEmailLayout, escapeHtml } from './email-layout';
import type { EmpresaBranding } from './email-branding';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  getDefinitionBySlug,
  overridesFromDefinition,
  writeNotificationLog,
  dedupEmails,
} from '@/lib/notifications';

const RESEND_FROM = 'DILESA <noreply@bsop.io>';
const ENCUESTA_SLUG = 'dilesa_encuesta';

export type EncuestaEmailVariante = 'inicial' | 'recordatorio' | 'ultimo';

export interface EncuestaEmailContext {
  clienteEmail: string;
  clienteNombre: string;
  proyectoNombre: string | null;
  /** URL absoluta de la encuesta (magic link). */
  encuestaUrl: string;
  branding: EmpresaBranding;
}

interface SendResult {
  ok: boolean;
  error?: string;
}

const COPY: Record<EncuestaEmailVariante, { subject: string; intro: string; cta: string }> = {
  inicial: {
    subject: '¿Cómo va tu nueva casa? Cuéntanos en 1 minuto',
    intro:
      'Ya tienes las llaves de tu nueva casa y para nosotros es muy importante saber cómo la recibiste. Te tomará menos de un minuto — son solo 4 preguntas.',
    cta: 'Responder la encuesta →',
  },
  recordatorio: {
    subject: 'Tu opinión nos importa — encuesta de tu nueva casa',
    intro:
      'Hace unos días te compartimos una encuesta breve sobre la entrega de tu casa. Si aún no has tenido oportunidad, nos encantaría escucharte — son solo 4 preguntas y nos ayuda a mejorar.',
    cta: 'Responder ahora →',
  },
  ultimo: {
    subject: 'Última oportunidad de contarnos cómo recibiste tu casa',
    intro:
      'No queremos insistir de más — este es nuestro último recordatorio. Si algo de tu casa o del proceso merece nuestra atención, este es el mejor canal para decírnoslo.',
    cta: 'Responder la encuesta →',
  },
};

export async function sendEncuestaEmail(
  ctx: EncuestaEmailContext,
  variante: EncuestaEmailVariante
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[encuesta-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }
  if (!ctx.clienteEmail) {
    return { ok: false, error: 'sin email del cliente' };
  }
  const { subject, html } = renderEncuestaEmail(ctx, variante);
  return postResend(apiKey, [ctx.clienteEmail], subject, html, {
    empresaId: ctx.branding.empresaId,
    context: { variante, tipo: 'cliente' },
  });
}

/** Render puro (testeable) del correo al cliente. */
export function renderEncuestaEmail(
  ctx: EncuestaEmailContext,
  variante: EncuestaEmailVariante
): { subject: string; html: string } {
  const copy = COPY[variante];
  const cta = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
           align="center" style="margin: 24px auto;">
      <tr>
        <td align="center" bgcolor="${ctx.branding.colorPrimario}"
            style="border-radius: 6px; padding: 12px 24px;">
          <a href="${escapeHtml(ctx.encuestaUrl)}"
             style="color: ${ctx.branding.colorInverso}; font-size: 15px;
                    font-weight: 700; text-decoration: none; display: inline-block;
                    letter-spacing: 0.5px;">
            ${copy.cta}
          </a>
        </td>
      </tr>
    </table>
    <p style="text-align: center; font-size: 12px; color: ${ctx.branding.colorSecundario};
              margin: -8px 0 16px;">
      Sin registro ni contraseña — solo abre la liga desde tu celular.
    </p>
  `;

  const bodyHtml = `
    <p style="font-size: 15px;">Hola <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
    <p>${escapeHtml(copy.intro)}</p>
    ${cta}
    <p style="margin-top: 16px; font-size: 13px; color: ${ctx.branding.colorSecundario};">
      Tus respuestas llegan directamente a nuestro equipo y nos ayudan a cuidar
      la calidad de cada vivienda que entregamos${
        ctx.proyectoNombre ? ` en ${escapeHtml(ctx.proyectoNombre)}` : ''
      }.
    </p>
    <p style="margin-top: 24px;">Gracias por tu confianza,<br/><b>Equipo DILESA</b></p>
  `.trim();

  const html = renderEmailLayout({
    branding: ctx.branding,
    titulo: 'ENCUESTA DE CONFORMIDAD',
    fechaTexto: fechaTextoMx(),
    bodyHtml,
  });

  return { subject: copy.subject, html };
}

export interface AvisoAtencionContext {
  destinatarios: string[];
  clienteNombre: string;
  clienteTelefono: string | null;
  proyectoNombre: string | null;
  unidadIdentificador: string | null;
  /** Liga a la captura interna de la Fase 16. */
  capturaUrl: string;
  branding: EmpresaBranding;
}

/** Aviso interno: el cliente no respondió tras 3 intentos → captura telefónica. */
export async function sendAvisoAtencionClientes(ctx: AvisoAtencionContext): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[encuesta-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }
  if (ctx.destinatarios.length === 0) {
    return { ok: false, error: 'sin destinatarios internos' };
  }
  const { subject, html } = renderAvisoAtencion(ctx);
  return postResend(apiKey, ctx.destinatarios, subject, html, {
    empresaId: ctx.branding.empresaId,
    context: { tipo: 'aviso_interno' },
  });
}

/** Render puro (testeable) del aviso interno a Atención a Clientes. */
export function renderAvisoAtencion(ctx: AvisoAtencionContext): { subject: string; html: string } {
  const ref = [ctx.proyectoNombre, ctx.unidadIdentificador].filter(Boolean).join(' · ');
  const bodyHtml = `
    <p style="font-size: 15px;">La encuesta de conformidad de
      <b>${escapeHtml(ctx.clienteNombre)}</b>${ref ? ` (${escapeHtml(ref)})` : ''}
      no fue respondida tras 3 intentos por correo.</p>
    <p>Siguiente paso (Fase 16): contactar al cliente por teléfono
      ${ctx.clienteTelefono ? `(<b>${escapeHtml(ctx.clienteTelefono)}</b>)` : ''}
      y capturar sus respuestas en el sistema, o marcar la encuesta como
      "sin respuesta" para cerrar la fase.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
           align="center" style="margin: 24px auto;">
      <tr>
        <td align="center" bgcolor="${ctx.branding.colorPrimario}"
            style="border-radius: 6px; padding: 12px 24px;">
          <a href="${escapeHtml(ctx.capturaUrl)}"
             style="color: ${ctx.branding.colorInverso}; font-size: 15px;
                    font-weight: 700; text-decoration: none; display: inline-block;">
            Capturar conformidad →
          </a>
        </td>
      </tr>
    </table>
  `.trim();

  const html = renderEmailLayout({
    branding: ctx.branding,
    titulo: 'ENCUESTA SIN RESPUESTA — ATENCIÓN A CLIENTES',
    fechaTexto: fechaTextoMx(),
    bodyHtml,
  });

  return {
    subject: `Encuesta sin respuesta — ${ctx.clienteNombre}${ref ? ` (${ref})` : ''}`,
    html,
  };
}

async function postResend(
  apiKey: string,
  to: string[],
  subject: string,
  html: string,
  meta: { empresaId: string | null; context: Record<string, unknown> }
): Promise<SendResult> {
  // Catálogo de notificaciones (slug `dilesa_encuesta`, gobierna el correo al
  // cliente y el aviso interno). El asunto sigue por-variante; del catálogo se
  // respetan kill switch, from/reply-to, recipientes extra y el log.
  // FAIL-OPEN: sin admin/definición se usa el comportamiento de hoy.
  const admin = getSupabaseAdminClient();
  const def = admin ? await getDefinitionBySlug(admin, ENCUESTA_SLUG, meta.empresaId) : null;
  const { killed, definitionId, overrides } = overridesFromDefinition(def);

  if (killed) {
    if (admin) {
      await writeNotificationLog(admin, {
        definitionId,
        empresaId: meta.empresaId,
        status: 'skipped',
        recipients: { to: [] },
        subject,
        context: meta.context,
      });
    }
    return { ok: false, error: 'kill switch (dilesa_encuesta desactivado)' };
  }

  const recipients = dedupEmails([...to, ...(overrides.extraTo ?? [])]);
  const ccs = dedupEmails(overrides.extraCc ?? []).filter(
    (c) => !recipients.some((r) => r.toLowerCase() === c.toLowerCase())
  );
  const bccs = dedupEmails(overrides.extraBcc ?? []).filter(
    (b) =>
      !recipients.some((r) => r.toLowerCase() === b.toLowerCase()) &&
      !ccs.some((c) => c.toLowerCase() === b.toLowerCase())
  );

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: overrides.from ?? RESEND_FROM,
      to: recipients,
      cc: ccs.length > 0 ? ccs : undefined,
      bcc: bccs.length > 0 ? bccs : undefined,
      reply_to: overrides.replyTo ?? undefined,
      subject,
      html,
    }),
  });
  const respId = resp.ok
    ? (((await resp.json().catch(() => null)) as { id?: string } | null)?.id ?? null)
    : null;

  if (admin) {
    await writeNotificationLog(admin, {
      definitionId,
      empresaId: meta.empresaId,
      status: resp.ok ? 'sent' : 'failed',
      recipients: { to: recipients, cc: ccs, bcc: bccs },
      subject,
      resendId: respId,
      errorMessage: resp.ok ? null : `resend ${resp.status}`,
      context: meta.context,
    });
  }

  if (!resp.ok) {
    console.warn(`[encuesta-emails] resend ${resp.status}`);
    return { ok: false, error: `resend ${resp.status}` };
  }
  return { ok: true };
}

function fechaTextoMx(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'Etc/GMT+6',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
