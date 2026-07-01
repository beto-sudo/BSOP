/**
 * Emails del flujo de dictamen notarial DILESA (Fase 7).
 *
 * Iniciativa `dilesa-portafolio-activos` Sprint 7f.
 *
 * 1 evento por ahora:
 *  - `dictamen_solicitud` → al cerrar Fase 7, mail a la notaría con los
 *    datos del cliente, inmueble y crédito + magic link para subir la
 *    Carta de Instrucción Notarial sin login.
 *
 * Recipients: el email del notario (`erp.personas.email` con tipo='notario').
 * Cc al gerente de ventas para trazabilidad. Si el notario NO tiene email,
 * el endpoint `notify-solicitud-dictamen` retorna 400 — el operador debe
 * imprimir y entregar la solicitud en papel (feature de PDF imprimible
 * queda para sprint siguiente).
 *
 * Idempotencia: `dilesa.ventas.notif_solicitud_dictamen_at`.
 */

import { renderEmailLayout, renderSeccionDatos, escapeHtml } from './email-layout';
import type { EmpresaBranding } from './email-branding';
import { dedupEmails, type NotificationOverrides } from '../notifications/overrides';

const RESEND_FROM = 'DILESA <noreply@bsop.io>';

export interface DictamenSolicitudContext {
  ventaId: string;
  empresaId: string;
  /** URL absoluta del magic link para subir el dictamen. */
  uploadUrl: string;
  /** Email del notario (recipient principal). */
  notarioEmail: string;
  /** Nombre del notario (saludo). */
  notarioNombre: string;
  /** Datos del cliente. */
  clienteNombre: string;
  clienteCurp?: string | null;
  clienteTelefono?: string | null;
  /** Datos del inmueble a escriturar. */
  proyectoNombre: string;
  unidadIdentificador: string;
  manzana?: string | null;
  lote?: string | null;
  prototipo?: string | null;
  domicilioOficial?: string | null;
  areaM2?: number | null;
  m2Construccion?: number | null;
  /** Datos del crédito para que el notario tenga contexto. */
  tipoCredito?: string | null;
  precioVenta?: number | null;
  montoCreditoTitular?: number | null;
  montoCreditoCotitular?: number | null;
  /** Contacto de Gerencia Ventas. */
  vendedorNombre: string | null;
  vendedorEmail: string | null;
  /** Branding (header + colores). */
  branding: EmpresaBranding;
}

interface SendResult {
  ok: boolean;
  sentTo: string[];
  error?: string;
}

export async function sendDictamenSolicitudEmail(
  ctx: DictamenSolicitudContext,
  overrides?: NotificationOverrides
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[dictamen-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, sentTo: [], error: 'RESEND_API_KEY missing' };
  }
  if (!ctx.notarioEmail) {
    console.warn('[dictamen-emails] sin email del notario', { ventaId: ctx.ventaId });
    return { ok: false, sentTo: [], error: 'sin email del notario' };
  }

  // Recipientes dinámicos (notario + cc al gerente de ventas) + los fijos del
  // catálogo (overrides.extra*). Sin overrides = comportamiento de siempre.
  const recipients = dedupEmails([ctx.notarioEmail, ...(overrides?.extraTo ?? [])]);
  const ccs = dedupEmails([
    ctx.vendedorEmail && ctx.vendedorEmail !== ctx.notarioEmail ? ctx.vendedorEmail : null,
    ...(overrides?.extraCc ?? []),
  ]).filter((c) => !recipients.some((r) => r.toLowerCase() === c.toLowerCase()));
  const bccs = dedupEmails(overrides?.extraBcc ?? []).filter(
    (b) =>
      !recipients.some((r) => r.toLowerCase() === b.toLowerCase()) &&
      !ccs.some((c) => c.toLowerCase() === b.toLowerCase())
  );

  const { subject: computedSubject, html } = renderTemplate(ctx);
  const subject = overrides?.subject ?? computedSubject;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: overrides?.from ?? RESEND_FROM,
      to: recipients,
      cc: ccs.length > 0 ? ccs : undefined,
      bcc: bccs.length > 0 ? bccs : undefined,
      reply_to: overrides?.replyTo ?? undefined,
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.warn(`[dictamen-emails] resend ${resp.status}: ${errText.slice(0, 400)}`);
    return { ok: false, sentTo: recipients, error: `resend ${resp.status}` };
  }
  return { ok: true, sentTo: [...recipients, ...ccs, ...bccs] };
}

function fechaTextoMx(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'Etc/GMT+6',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

function renderTemplate(ctx: DictamenSolicitudContext): { subject: string; html: string } {
  const fecha = fechaTextoMx();
  const ref = `${ctx.proyectoNombre} · ${ctx.unidadIdentificador}`;

  const datosInmueble = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Datos del inmueble a escriturar',
    filas: [
      { label: 'FRACCIONAMIENTO', value: ctx.proyectoNombre || null },
      { label: 'MANZANA', value: ctx.manzana ?? null },
      { label: 'LOTE', value: ctx.lote ?? null },
      { label: 'PROTOTIPO', value: ctx.prototipo ?? null },
      { label: 'IDENTIFICACIÓN INVENTARIO', value: ctx.unidadIdentificador },
      { label: 'DIRECCIÓN', value: ctx.domicilioOficial ?? null },
      {
        label: 'ÁREA TERRENO',
        value: ctx.areaM2 != null ? `${ctx.areaM2.toFixed(2)} m²` : null,
      },
      {
        label: 'ÁREA CONSTRUIDA',
        value: ctx.m2Construccion != null ? `${ctx.m2Construccion.toFixed(2)} m²` : null,
      },
    ],
  });

  const datosCliente = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Datos del comprador',
    filas: [
      { label: 'NOMBRE', value: ctx.clienteNombre },
      { label: 'CURP', value: ctx.clienteCurp ?? null },
      { label: 'TELÉFONO', value: ctx.clienteTelefono ?? null },
    ],
  });

  const datosCredito = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Datos de la operación',
    filas: [
      { label: 'TIPO DE CRÉDITO', value: ctx.tipoCredito ?? null },
      { label: 'PRECIO DE VENTA', value: ctx.precioVenta != null ? money(ctx.precioVenta) : null },
      {
        label: 'CRÉDITO TITULAR',
        value: ctx.montoCreditoTitular != null ? money(ctx.montoCreditoTitular) : null,
      },
      {
        label: 'CRÉDITO CO-TITULAR',
        value:
          ctx.montoCreditoCotitular != null && ctx.montoCreditoCotitular > 0
            ? money(ctx.montoCreditoCotitular)
            : null,
      },
    ],
  });

  const datosContactoVentas = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Contacto para coordinar la entrega',
    filas: [
      { label: 'GERENCIA DE VENTAS', value: ctx.vendedorNombre || null },
      { label: 'CORREO', value: ctx.vendedorEmail || null },
    ],
  });

  const ctaSubir = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
           align="center" style="margin: 24px auto;">
      <tr>
        <td align="center" bgcolor="${ctx.branding.colorPrimario}"
            style="border-radius: 6px; padding: 12px 24px;">
          <a href="${escapeHtml(ctx.uploadUrl)}"
             style="color: ${ctx.branding.colorInverso}; font-size: 15px;
                    font-weight: 700; text-decoration: none; display: inline-block;
                    letter-spacing: 0.5px;">
            Subir Carta de Instrucción aquí →
          </a>
        </td>
      </tr>
    </table>
    <p style="text-align: center; font-size: 12px; color: ${ctx.branding.colorSecundario};
              margin: -8px 0 16px;">
      El enlace expira en 60 días y permite subir solo este dictamen.
    </p>
  `;

  const bodyHtml = `
    <p style="font-size: 15px;">Estimado(a) <b>${escapeHtml(ctx.notarioNombre)}</b>,</p>
    <p>Por medio del presente solicitamos sus servicios para el <b>dictamen
       jurídico y elaboración de la Carta de Instrucción Notarial</b> de la
       siguiente operación inmobiliaria. A continuación encontrará los datos
       del inmueble, del comprador y de la operación.</p>
    ${datosInmueble}
    ${datosCliente}
    ${datosCredito}
    ${datosContactoVentas}
    <p style="margin-top: 20px;">Una vez concluido el dictamen, le agradeceremos
       <b>cargar la Carta de Instrucción directamente en nuestro sistema</b>
       usando el siguiente enlace seguro. No necesita iniciar sesión — solo
       abra el enlace y suba el PDF.</p>
    ${ctaSubir}
    <p style="margin-top: 16px; font-size: 13px; color: ${ctx.branding.colorSecundario};">
      Si prefiere, también puede enviar el dictamen por correo al gerente de
      ventas indicado arriba y nosotros lo capturamos por usted.
    </p>
    <p style="margin-top: 24px;">Agradecemos su atención y quedamos a sus órdenes,<br/>
       <b>Equipo DILESA</b></p>
  `.trim();

  const subject = `Solicitud de dictaminación notarial — ${ref}`;
  const html = renderEmailLayout({
    branding: ctx.branding,
    titulo: 'SOLICITUD DE DICTAMINACIÓN',
    fechaTexto: fecha,
    bodyHtml,
  });
  return { subject, html };
}
