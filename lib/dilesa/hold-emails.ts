/**
 * Emails del sistema de hold + cola DILESA.
 *
 * Iniciativa `dilesa-prelaunch-audit` Fase 2.
 *
 * 5 eventos:
 *  - `hold_creado`     → al crear solicitud (vendedor + cliente reciben datos
 *                        + deadline + lo que falta para completar expediente)
 *  - `hold_promovido`  → al subir como nuevo líder tras expiración del previo
 *                        (vendedor + cliente reciben deadline fresco)
 *  - `hold_4h_warning` → 4h antes del deadline si no se ha completado
 *  - `hold_expirada`   → al expirar el hold (vendedor + cliente del que pierde)
 *  - `desasignada`     → cuando Dirección desasigna la venta (cliente +
 *                        vendedor con motivo)
 *
 * Recipients para los 5 eventos: vendedor (su email de core.usuarios) +
 * cliente (persona.email). Si el cliente no tiene email solo va al vendedor.
 *
 * Idempotencia: cada evento tiene su columna `notif_hold_*_at` en
 * `dilesa.ventas`. El caller (cron/form/autoriza) revisa el timestamp
 * antes de llamar para no duplicar envíos.
 *
 * Diseño visual: todos los templates usan el layout reusable
 * `lib/dilesa/email-layout.ts` con header/footer verde estilo Coda.
 */

import { formatearVencimiento } from './hold-cola';
import {
  renderEmailLayout,
  renderSeccionDatos,
  pillIdentificador,
  escapeHtml,
} from './email-layout';

/**
 * `From` para Resend. Usa `noreply@bsop.io` porque es el dominio que el
 * proyecto tiene verificado en Resend (mismo patrón que `lib/juntas/email.ts`).
 * Usar `@dilesa.mx` sin verificar el dominio en Resend hace que TODOS los
 * envíos sean rechazados silenciosamente — fue la causa de que el primer
 * email de hold no llegara.
 */
const RESEND_FROM = 'DILESA <noreply@bsop.io>';

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
  /** Manzana de la unidad (ej. "11"). Para sección de datos de vivienda. */
  manzana?: string | null;
  /** Lote de la unidad (ej. "19"). */
  lote?: string | null;
  /** Sufijo del prototipo (ej. "ISC"). */
  prototipo?: string | null;
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

function fechaTextoMx(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'Etc/GMT+6',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function seccionDatosVivienda(ctx: HoldEmailContext, tituloSeccion: string): string {
  return renderSeccionDatos({
    titulo: tituloSeccion,
    filas: [
      { label: 'FRACCIONAMIENTO', value: ctx.proyectoNombre || null },
      { label: 'MANZANA', value: ctx.manzana ?? null },
      { label: 'LOTE', value: ctx.lote ?? null },
      { label: 'PROTOTIPO', value: ctx.prototipo ?? null },
      { label: 'IDENTIFICACIÓN INVENTARIO', value: ctx.unidadIdentificador },
      { label: 'ASESOR DE VENTAS', value: ctx.vendedorNombre || null },
    ],
  });
}

function faltantesBloque(faltantes?: string[]): string {
  if (!faltantes || faltantes.length === 0) return '';
  return `
    <p style="margin: 16px 0 4px;"><b>Pendiente subir:</b></p>
    <ul style="margin: 4px 0 12px; padding-left: 20px;">
      ${faltantes.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
    </ul>
  `;
}

function renderTemplate(
  type: HoldEventType,
  ctx: HoldEmailContext
): { subject: string; html: string } {
  const ref = `${ctx.proyectoNombre} · ${ctx.unidadIdentificador}`;
  const fecha = fechaTextoMx();
  const fechaDeadline = ctx.expiraAt ? formatearVencimiento(ctx.expiraAt) : null;

  switch (type) {
    case 'hold_creado': {
      const body = `
        <p style="font-size: 15px;">Hola <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
        <p>En DILESA estamos felices de acompañarte en el proceso de compra de tu nueva vivienda.
           Te damos la bienvenida y te confirmamos que se registró tu <b>solicitud de asignación</b>
           para la unidad ${pillIdentificador(ctx.unidadIdentificador)}.</p>
        ${seccionDatosVivienda(ctx, 'Datos de la vivienda apartada')}
        <p style="margin-top: 20px;">A partir de hoy te <b>llevaremos de la mano</b> paso a paso por todo el proceso —
           desde la firma del contrato de promesa, el avalúo del banco, la dictaminación del
           crédito, hasta la escrituración y entrega de las llaves de tu vivienda.</p>
        <p><b>Tu unidad queda apartada (en "hold") hasta ${escapeHtml(fechaDeadline ?? 'el plazo definido')}.</b>
           En ese plazo necesitamos que nos entregues el expediente completo con todos los documentos
           firmados — solicitud de asignación, aviso de privacidad, FICU y expediente digital — y el
           comprobante del pago del enganche.</p>
        <p>Si por algún motivo no se completa el expediente en ese plazo, el apartado se libera y la
           unidad pasa a la siguiente persona interesada. Por eso es importante que avancemos juntos
           en estos 2 días hábiles.</p>
        ${faltantesBloque(ctx.faltantes)}
        <p>Cualquier duda, tu asesor de ventas <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b>
           está a tus órdenes para orientarte en cada paso.</p>
        <p style="margin-top: 24px;">Bienvenido a tu nuevo hogar,<br/><b>Equipo DILESA</b></p>
      `.trim();
      return {
        subject: `Bienvenido a DILESA — Tu solicitud por ${ref}`,
        html: renderEmailLayout({ titulo: 'BIENVENIDA', fechaTexto: fecha, bodyHtml: body }),
      };
    }
    case 'hold_promovido': {
      const body = `
        <p style="font-size: 15px;">Estimad@ <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
        <p>La solicitud anterior para la unidad ${pillIdentificador(ctx.unidadIdentificador)}
           expiró sin completar expediente. Tu solicitud sube a <b>líder de la fila</b>.</p>
        ${seccionDatosVivienda(ctx, 'Datos de la vivienda apartada')}
        <p style="margin-top: 20px;">Tienes hasta <b>${escapeHtml(fechaDeadline ?? 'el plazo definido')}</b>
           para completar el expediente con todos los documentos firmados. Si no, el hold se pierde y la
           siguiente solicitud en la fila tomará el lugar.</p>
        ${faltantesBloque(ctx.faltantes)}
        <p>Tu asesor de ventas <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b> está a tus órdenes
           para ayudarte a completar el expediente.</p>
        <p style="margin-top: 24px;">Atentamente,<br/><b>Equipo DILESA</b></p>
      `.trim();
      return {
        subject: `Subes a líder de la fila — ${ref}`,
        html: renderEmailLayout({
          titulo: 'NUEVO LÍDER DE LA FILA',
          fechaTexto: fecha,
          bodyHtml: body,
        }),
      };
    }
    case 'hold_4h_warning': {
      const body = `
        <p style="font-size: 15px;">Estimad@ <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
        <p>El apartado de tu unidad ${pillIdentificador(ctx.unidadIdentificador)}
           <b>expira en menos de 4 horas</b> (${escapeHtml(fechaDeadline ?? 'pronto')}).</p>
        ${seccionDatosVivienda(ctx, 'Datos de la vivienda apartada')}
        <p style="margin-top: 20px;">Si no completas el expediente antes de esa hora, el apartado pasa
           a la siguiente persona en la fila.</p>
        ${faltantesBloque(ctx.faltantes)}
        <p>Tu asesor de ventas <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b> está a tus
           órdenes para ayudarte a entregar los documentos que falten.</p>
        <p style="margin-top: 24px;">Atentamente,<br/><b>Equipo DILESA</b></p>
      `.trim();
      return {
        subject: `Tu apartado expira en menos de 4 horas — ${ref}`,
        html: renderEmailLayout({
          titulo: 'EXPIRACIÓN PRÓXIMA',
          fechaTexto: fecha,
          bodyHtml: body,
        }),
      };
    }
    case 'hold_expirada': {
      const body = `
        <p style="font-size: 15px;">Estimad@ <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
        <p>El apartado de la unidad ${pillIdentificador(ctx.unidadIdentificador)} expiró porque el
           expediente no quedó completo en el plazo de 2 días hábiles.</p>
        ${seccionDatosVivienda(ctx, 'Datos de la vivienda apartada')}
        <p style="margin-top: 20px;">La unidad pasó a la siguiente persona en la fila. Si sigues
           interesad@, tu asesor de ventas <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b>
           puede ayudarte a crear una nueva solicitud y volver a entrar a la fila.</p>
        <p>Agradecemos tu interés en DILESA.</p>
        <p style="margin-top: 24px;">Atentamente,<br/><b>Equipo DILESA</b></p>
      `.trim();
      return {
        subject: `Apartado expirado — ${ref}`,
        html: renderEmailLayout({
          titulo: 'APARTADO EXPIRADO',
          fechaTexto: fecha,
          bodyHtml: body,
        }),
      };
    }
    case 'desasignada': {
      const motivoBloque = ctx.motivo
        ? `
          <h2 style="color: #5E6A2D; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; margin: 20px 0 8px; text-transform: uppercase;">
            Motivo de desasignación
          </h2>
          <p style="margin: 4px 0 16px; padding: 12px; background: #f5f5f0; border-left: 4px solid #7C8A3F; font-size: 14px;">
            ${escapeHtml(ctx.motivo)}
          </p>`
        : '';
      const body = `
        <p style="font-size: 15px;">ESTIMAD@ <b>${escapeHtml(ctx.clienteNombre)}</b>,</p>
        <p>Por medio del presente le informamos que nos vimos en la necesidad de desasignar la
           ubicación que previamente teníamos reservada para usted.</p>
        ${seccionDatosVivienda(ctx, 'Datos de la vivienda desasignada')}
        ${motivoBloque}
        <p style="margin-top: 20px;">Esperamos poder atenderlo en un futuro próximo. Para cualquier
           duda o aclaración, favor de responder este correo o contactar a su asesor de ventas
           <b>${escapeHtml(ctx.vendedorNombre ?? 'asignado')}</b>.</p>
        <p style="margin-top: 24px;">Atentamente,<br/><b>Administración DILESA</b></p>
        <p style="margin-top: 12px; color: #888; font-size: 13px;">Gracias por su preferencia.</p>
      `.trim();
      return {
        subject: `Desasignación de la unidad ${ref}`,
        html: renderEmailLayout({
          titulo: 'DESASIGNACIÓN',
          fechaTexto: fecha,
          bodyHtml: body,
        }),
      };
    }
  }
}
