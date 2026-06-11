/**
 * Email de escrituración DILESA (Fase 11 — Escriturada).
 *
 * Remate post-cierre de `dilesa-ventas-expediente`: replica el correo que
 * Coda mandaba al registrar la fase ("📜 Escrituración …") y lo mejora:
 *  - redacción corregida + sin links internos (el de Coda incluía la URL
 *    del doc al cliente),
 *  - agrega número de escritura y toma los datos de la notaría del
 *    catálogo (`dilesa.ventas.notario_id` → `erp.personas`),
 *  - branding de empresa (`renderEmailLayout`) en lugar de imágenes
 *    pegadas a mano.
 *
 * Recipients: cliente (TO) + vendedor (CC) + extras del catálogo
 * `core.notification_definitions` slug `dilesa_escrituracion` (ahí vive
 * `escrituras@dilesa.mx` como `always`, editable runtime).
 *
 * Idempotencia: `dilesa.ventas.notif_escrituracion_at`. El endpoint
 * decide (auto vs reenviar vs prueba); aquí solo se renderiza y envía.
 */

import { renderEmailLayout, renderSeccionDatos, escapeHtml } from './email-layout';
import type { EmpresaBranding } from './email-branding';

/** Fallbacks si el catálogo no responde (FAIL-OPEN, patrón welcome). */
export const ESCRITURACION_SLUG = 'dilesa_escrituracion';
export const ESCRITURACION_FROM_FALLBACK = 'DILESA <noreply@bsop.io>';
export const ESCRITURACION_REPLY_TO_FALLBACK = 'admin@dilesa.mx';
export const ESCRITURACION_EXTRA_TO_FALLBACK = ['escrituras@dilesa.mx'];
export const ESCRITURACION_SUBJECT_FALLBACK =
  '📜 Escrituración {proyecto} — {cliente} ({identificador})';

export interface EscrituracionEmailContext {
  ventaId: string;
  empresaId: string;
  /** Datos del cliente. */
  clienteNombre: string;
  /** Datos del inmueble. */
  proyectoNombre: string | null;
  unidadIdentificador: string | null;
  areaM2: number | null;
  prototipo: string | null;
  m2Construccion: number | null;
  domicilioOficial: string | null;
  /** Datos de la escritura (Fase 11). */
  numeroEscritura: string | null;
  /** ISO date `YYYY-MM-DD`. */
  fechaEscritura: string;
  valorEscrituracion: number | null;
  /** Datos de la notaría (notario_id → erp.personas; opcionales). */
  notarioNombre: string | null;
  notarioTelefono: string | null;
  notarioEmail: string | null;
  /** Branding (header + colores) — viene de loadEmpresaBranding. */
  branding: EmpresaBranding;
}

/** Destinatarios + sobre ya resueltos por el endpoint (catálogo o fallback). */
export interface EscrituracionDelivery {
  from: string;
  replyTo: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
}

export interface SendEscrituracionResult {
  ok: boolean;
  sentTo: string[];
  resendId: string | null;
  error?: string;
}

/**
 * Envía el correo de escrituración. Una falla NO bloquea la operación
 * principal (mismo patrón que avaluo-emails) — el caller loguea y el
 * operador puede reintentar con el botón del expediente.
 */
export async function sendEscrituracionEmail(
  ctx: EscrituracionEmailContext,
  delivery: EscrituracionDelivery
): Promise<SendEscrituracionResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[escrituracion-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, sentTo: [], resendId: null, error: 'RESEND_API_KEY missing' };
  }
  if (delivery.to.length === 0) {
    return { ok: false, sentTo: [], resendId: null, error: 'sin destinatarios' };
  }

  const html = renderEscrituracionHtml(ctx);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: delivery.from,
      to: delivery.to,
      cc: delivery.cc.length > 0 ? delivery.cc : undefined,
      bcc: delivery.bcc.length > 0 ? delivery.bcc : undefined,
      reply_to: delivery.replyTo ?? undefined,
      subject: delivery.subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.warn(`[escrituracion-emails] resend ${resp.status}: ${errText.slice(0, 400)}`);
    return {
      ok: false,
      sentTo: delivery.to,
      resendId: null,
      error: `resend ${resp.status}`,
    };
  }
  const body = (await resp.json().catch(() => null)) as { id?: string } | null;
  return {
    ok: true,
    sentTo: [...delivery.to, ...delivery.cc, ...delivery.bcc],
    resendId: body?.id ?? null,
  };
}

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/**
 * Formatea un ISO date (`YYYY-MM-DD`) como "8 de junio de 2026" sin
 * arrastre de timezone (parsear con `new Date('YYYY-MM-DD')` y formatear
 * en GMT-6 regresaría el día anterior).
 */
function fechaLargaMx(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function fechaHoyMx(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'Etc/GMT+6',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

const m2 = (n: number | null): string | null => (n != null ? `${Number(n).toFixed(2)} m²` : null);

/** Render del HTML completo — exportado para previews/pruebas. */
export function renderEscrituracionHtml(ctx: EscrituracionEmailContext): string {
  const b = ctx.branding;

  const datosOperacion = renderSeccionDatos({
    branding: b,
    titulo: 'Datos de la operación',
    filas: [
      { label: 'NOMBRE DEL CLIENTE', value: ctx.clienteNombre },
      { label: 'IDENTIFICACIÓN DEL INMUEBLE', value: ctx.unidadIdentificador },
      { label: 'FRACCIONAMIENTO', value: ctx.proyectoNombre },
      { label: 'SUPERFICIE', value: m2(ctx.areaM2) },
      { label: 'PROTOTIPO', value: ctx.prototipo },
      { label: 'CONSTRUCCIÓN', value: m2(ctx.m2Construccion) },
      { label: 'DIRECCIÓN', value: ctx.domicilioOficial },
      { label: 'NÚMERO DE ESCRITURA', value: ctx.numeroEscritura },
      { label: 'FECHA DE ESCRITURA', value: fechaLargaMx(ctx.fechaEscritura) },
      {
        label: 'VALOR DE ESCRITURACIÓN',
        value:
          ctx.valorEscrituracion != null
            ? `${moneyFmt.format(Number(ctx.valorEscrituracion))} MXN`
            : null,
      },
    ],
  });

  const datosNotaria =
    ctx.notarioNombre || ctx.notarioTelefono || ctx.notarioEmail
      ? renderSeccionDatos({
          branding: b,
          titulo: 'Datos de la notaría',
          filas: [
            { label: 'NOTARIO', value: ctx.notarioNombre },
            { label: 'TELÉFONO', value: ctx.notarioTelefono },
            { label: 'EMAIL', value: ctx.notarioEmail },
          ],
        })
      : '';

  const avisoRegistro = `
    <p style="margin: 20px 0 16px; padding: 12px; background: ${b.colorFondoBrand}; border-left: 4px solid ${b.colorPrimario}; font-size: 14px; color: ${b.colorTextoTitulo};">
      Tome en cuenta que las escrituras públicas toman <b>aproximadamente tres
      meses</b> en quedar inscritas en el Registro Público de la Propiedad. Le
      recomendamos estar al pendiente y, llegado el momento, contactar a la
      notaría que elaboró su escritura para obtener el documento legal que
      ampara su compra.
    </p>
  `;

  const bodyHtml = `
    <p style="font-size: 15px;">Estimado(a) <b>${escapeHtml(ctx.clienteNombre)}</b>:</p>
    <p>Le informamos que <b>su escritura ha quedado registrada</b> en nuestro
       sistema. Para DILESA ha sido un placer poder llevarle de la mano en este
       gran viaje; pronto le estaremos entregando la vivienda que con mucho
       empeño construimos para usted.</p>
    <p>A continuación le proporcionamos los datos de la operación:</p>
    ${datosOperacion}
    ${avisoRegistro}
    ${datosNotaria}
    <p style="margin-top: 20px; font-size: 13px; color: ${b.colorSecundario};">
      Si tiene cualquier duda, puede responder directamente a este correo.
    </p>
    <p style="margin-top: 24px;">Gracias por su preferencia,<br/>
       <b>Equipo DILESA</b></p>
  `.trim();

  return renderEmailLayout({
    branding: b,
    titulo: 'ESCRITURACIÓN',
    fechaTexto: fechaHoyMx(),
    bodyHtml,
  });
}
