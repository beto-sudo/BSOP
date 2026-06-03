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

/**
 * `From` para Resend. Usa `noreply@bsop.io` porque es el dominio que el
 * proyecto tiene verificado en Resend (mismo patrón que `lib/juntas/email.ts`).
 * Usar `@dilesa.mx` sin verificar el dominio en Resend hace que TODOS los
 * envíos sean rechazados silenciosamente — fue la causa de que el primer
 * email de hold no llegara.
 */
const RESEND_FROM = 'DILESA <noreply@bsop.io>';
const URL_BSOP = 'https://bsop.io';

export type HoldEventType =
  | 'hold_creado'
  | 'hold_promovido'
  | 'hold_4h_warning'
  | 'hold_expirada'
  | 'desasignada';

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
  /** Motivo de la desasignación (solo aplica para evento `desasignada`). */
  motivo?: string | null;
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
        subject: `Bienvenido a DILESA — Tu solicitud por ${ref}`,
        html: `
          <p>Hola <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
          <p>En DILESA estamos felices de acompañarte en el proceso de compra de tu nueva vivienda.
             Te damos la bienvenida y te confirmamos que se registró tu <b>solicitud de asignación</b>
             para la unidad <b>${escapeHtml(ref)}</b>.</p>
          <p>A partir de hoy te <b>llevaremos de la mano</b> paso a paso por todo el proceso —
             desde la firma del contrato de promesa, el avalúo del banco, la dictaminación del
             crédito, hasta la escrituración y entrega de las llaves de tu vivienda.</p>
          <p><b>Tu unidad queda apartada (en "hold") hasta ${fechaDeadline ?? 'el plazo definido'}.</b>
             En ese plazo necesitamos que nos entregues el expediente completo con todos los
             documentos firmados — solicitud de asignación, aviso de privacidad, FICU y expediente
             digital — y el comprobante del pago del enganche.</p>
          <p>Si por algún motivo no se completa el expediente en ese plazo, el apartado se libera
             y la unidad pasa a la siguiente persona interesada. Por eso es importante que avancemos
             juntos en estos 2 días hábiles.</p>
          ${faltantesHtml}
          <p>Cualquier duda, tu asesor de ventas
             <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b> te puede orientar en cada paso.</p>
          <p><a href="${linkVenta}">Ver el avance de tu expediente</a></p>
          <p>Bienvenido a tu nuevo hogar,<br/>— Equipo DILESA</p>
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
    case 'desasignada': {
      const motivoHtml = ctx.motivo ? `<p><b>Motivo:</b> ${escapeHtml(ctx.motivo)}</p>` : '';
      return {
        subject: `Desasignación de la unidad ${ref}`,
        html: `
          <p>Estimado/a <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
          <p>Te escribimos para informarte que la asignación de la unidad
             <b>${escapeHtml(ref)}</b> que estaba a tu nombre fue cancelada
             por nuestra dirección.</p>
          ${motivoHtml}
          <p>Sabemos que es una noticia que no esperabas y lamentamos las
             molestias que esto pueda causar. Si quieres entender mejor la
             situación o explorar otra unidad disponible, tu asesor de ventas
             <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b> está a tus
             órdenes para acompañarte.</p>
          <p>Agradecemos sinceramente la confianza que depositaste en
             DILESA. Quedamos a tus órdenes para cualquier siguiente paso
             que decidas dar.</p>
          <p>Atentamente,<br/>— Equipo DILESA</p>
        `.trim(),
      };
    }
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
