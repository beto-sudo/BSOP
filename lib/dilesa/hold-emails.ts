/**
 * Emails del sistema de hold + cola DILESA.
 *
 * Iniciativa `dilesa-prelaunch-audit` Fase 2.
 *
 * 4 eventos:
 *  - `hold_creado`     → al crear solicitud (vendedor + cliente reciben datos
 *                        + deadline + lo que falta para completar expediente)
 *  - `hold_promovido`  → al subir como nuevo líder tras expiración del previo
 *                        (vendedor + cliente reciben deadline fresco)
 *  - `hold_4h_warning` → 4h antes del deadline si no se ha completado
 *  - `hold_expirada`   → al expirar el hold (vendedor + cliente del que pierde)
 *
 * Recipients para los 4 eventos: vendedor (su email de core.usuarios) +
 * cliente (persona.email). Si el cliente no tiene email solo va al vendedor.
 *
 * Idempotencia: cada evento tiene su columna `notif_hold_*_at` en
 * `dilesa.ventas`. El caller (cron/form/autoriza) revisa el timestamp
 * antes de llamar para no duplicar envíos.
 */

import { formatearVencimiento } from './hold-cola';

const RESEND_FROM = 'DILESA <ventas@dilesa.mx>';
const URL_BSOP = 'https://bsop.io';

export type HoldEventType = 'hold_creado' | 'hold_promovido' | 'hold_4h_warning' | 'hold_expirada';

export interface HoldEmailContext {
  ventaId: string;
  empresaId: string;
  vendedorEmail: string | null;
  vendedorNombre: string | null;
  clienteEmail: string | null;
  clienteNombre: string;
  unidadIdentificador: string;
  proyectoNombre: string;
  expiraAt: Date | null;
  /** Lista de adjuntos que faltan para completar expediente. */
  faltantes?: string[];
}

interface SendResult {
  ok: boolean;
  sentTo: string[];
  error?: string;
}

/**
 * Envía email para un evento del hold. Falla NO bloquea la operación
 * principal (mismo patrón que juntas) — sólo loguea a console.warn.
 *
 * Retorna `{ ok, sentTo, error? }` para que el caller decida si marcar
 * el timestamp de idempotencia.
 */
export async function sendHoldEmail(
  type: HoldEventType,
  ctx: HoldEmailContext
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[hold-emails] RESEND_API_KEY missing — skipping ${type}`);
    return { ok: false, sentTo: [], error: 'RESEND_API_KEY missing' };
  }

  const recipients: string[] = [];
  if (ctx.vendedorEmail) recipients.push(ctx.vendedorEmail);
  if (ctx.clienteEmail && ctx.clienteEmail !== ctx.vendedorEmail) {
    recipients.push(ctx.clienteEmail);
  }
  if (recipients.length === 0) {
    console.warn(`[hold-emails] no recipients for ${type} venta=${ctx.ventaId}`);
    return { ok: false, sentTo: [], error: 'no recipients' };
  }

  const { subject, html } = renderTemplate(type, ctx);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.warn(`[hold-emails] resend ${resp.status} ${type}: ${errText.slice(0, 400)}`);
    return { ok: false, sentTo: recipients, error: `resend ${resp.status}` };
  }
  return { ok: true, sentTo: recipients };
}

function renderTemplate(
  type: HoldEventType,
  ctx: HoldEmailContext
): { subject: string; html: string } {
  const ref = `${ctx.proyectoNombre} · ${ctx.unidadIdentificador}`;
  const linkVenta = `${URL_BSOP}/dilesa/ventas/${ctx.ventaId}`;
  const fechaDeadline = ctx.expiraAt ? formatearVencimiento(ctx.expiraAt) : null;
  const faltantesHtml =
    ctx.faltantes && ctx.faltantes.length > 0
      ? `<p><b>Pendiente subir:</b></p><ul>${ctx.faltantes.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : '';

  switch (type) {
    case 'hold_creado':
      return {
        subject: `Solicitud de asignación creada — ${ref}`,
        html: `
          <p>Hola,</p>
          <p>Se registró una <b>solicitud de asignación</b> para la unidad <b>${escapeHtml(ref)}</b> a nombre de <b>${escapeHtml(ctx.clienteNombre)}</b>.</p>
          <p>Esta unidad queda en <b>hold</b> hasta <b>${fechaDeadline ?? 'el plazo definido'}</b>. Antes de esa fecha hay que completar el expediente con todos los documentos firmados; si no, el hold se pierde y la siguiente solicitud en la fila toma el lugar.</p>
          ${faltantesHtml}
          <p><a href="${linkVenta}">Ver expediente en BSOP</a></p>
          <p>— DILESA</p>
        `.trim(),
      };
    case 'hold_promovido':
      return {
        subject: `Subes a líder de la fila — ${ref}`,
        html: `
          <p>Hola,</p>
          <p>La solicitud anterior para la unidad <b>${escapeHtml(ref)}</b> expiró sin completar expediente. Tu solicitud a nombre de <b>${escapeHtml(ctx.clienteNombre)}</b> sube a <b>líder de la fila</b>.</p>
          <p>Tienes hasta <b>${fechaDeadline ?? 'el plazo definido'}</b> para completar el expediente con todos los documentos firmados. Si no, el hold se pierde y la siguiente solicitud en la fila tomará el lugar.</p>
          ${faltantesHtml}
          <p><a href="${linkVenta}">Ver expediente en BSOP</a></p>
          <p>— DILESA</p>
        `.trim(),
      };
    case 'hold_4h_warning':
      return {
        subject: `⚠️ Tu hold expira en menos de 4 horas — ${ref}`,
        html: `
          <p>Hola,</p>
          <p>El hold de la unidad <b>${escapeHtml(ref)}</b> a nombre de <b>${escapeHtml(ctx.clienteNombre)}</b> expira en menos de 4 horas (${fechaDeadline ?? 'pronto'}).</p>
          <p>Si no completas el expediente antes de esa hora, el hold pasa al siguiente en la fila.</p>
          ${faltantesHtml}
          <p><a href="${linkVenta}">Completar expediente en BSOP</a></p>
          <p>— DILESA</p>
        `.trim(),
      };
    case 'hold_expirada':
      return {
        subject: `Hold expirado — ${ref}`,
        html: `
          <p>Hola,</p>
          <p>El hold de la unidad <b>${escapeHtml(ref)}</b> a nombre de <b>${escapeHtml(ctx.clienteNombre)}</b> expiró porque el expediente no quedó completo en el plazo de 2 días hábiles.</p>
          <p>La unidad pasó al siguiente vendedor en la fila. Si el cliente sigue interesado, puedes crear una nueva solicitud y volver a entrar a la fila por orden de timestamp.</p>
          <p><a href="${linkVenta}">Ver historial de la solicitud</a></p>
          <p>— DILESA</p>
        `.trim(),
      };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
