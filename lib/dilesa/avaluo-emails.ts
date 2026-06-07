/**
 * Emails del flujo de avalúo DILESA (Fase 4).
 *
 * Iniciativa `dilesa-portafolio-activos` Sprint 7d.
 *
 * 1 evento por ahora:
 *  - `avaluo_solicitud` → al cerrar Fase 4, mail a la casa valuadora con
 *    los datos del inmueble y del cliente para coordinar la visita.
 *
 * Recipients: el email del valuador (`erp.personas.email` del registro
 * tipo='valuador'). Sin copia al cliente — el cliente no necesita ver
 * la coordinación operativa con el valuador.
 *
 * Idempotencia: `dilesa.ventas.notif_solicitud_avaluo_at`. El caller
 * (server action / endpoint) revisa el timestamp antes de llamar.
 */

import { renderEmailLayout, renderSeccionDatos, escapeHtml } from './email-layout';
import type { EmpresaBranding } from './email-branding';

/**
 * `From` para Resend — mismo dominio verificado que el resto de los
 * emails DILESA. Ver lib/dilesa/hold-emails.ts § "RESEND_FROM" para el
 * porqué de `noreply@bsop.io`.
 */
const RESEND_FROM = 'DILESA <noreply@bsop.io>';

export interface AvaluoSolicitudContext {
  ventaId: string;
  empresaId: string;
  /** Email del valuador (recipient principal). */
  valuadorEmail: string;
  /** Nombre comercial de la casa valuadora (saludo). */
  valuadorNombre: string;
  /** Nombre del contacto operativo en la casa valuadora (si aplica). */
  valuadorContacto?: string | null;
  /** Datos del cliente (sin info financiera). */
  clienteNombre: string;
  clienteCurp?: string | null;
  clienteTelefono?: string | null;
  /** Datos del inmueble a valuar. */
  proyectoNombre: string;
  unidadIdentificador: string;
  manzana?: string | null;
  lote?: string | null;
  prototipo?: string | null;
  domicilioOficial?: string | null;
  areaM2?: number | null;
  m2Construccion?: number | null;
  esquina?: boolean | null;
  tieneFrenteVerde?: boolean | null;
  /** Datos del gerente de ventas que coordina el contacto. */
  vendedorNombre: string | null;
  vendedorEmail: string | null;
  vendedorTelefono?: string | null;
  /** Branding (header + colores) — viene de loadEmpresaBranding. */
  branding: EmpresaBranding;
}

interface SendResult {
  ok: boolean;
  sentTo: string[];
  error?: string;
}

/**
 * Envía la solicitud de avalúo al valuador asignado. Falla NO bloquea la
 * operación principal (mismo patrón que hold-emails) — sólo loguea a
 * console.warn.
 */
export async function sendAvaluoSolicitudEmail(ctx: AvaluoSolicitudContext): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[avaluo-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, sentTo: [], error: 'RESEND_API_KEY missing' };
  }

  if (!ctx.valuadorEmail) {
    console.warn('[avaluo-emails] sin email del valuador', { ventaId: ctx.ventaId });
    return { ok: false, sentTo: [], error: 'sin email del valuador' };
  }

  // Copia al gerente de ventas para que tenga trazabilidad de qué se mandó.
  const recipients: string[] = [ctx.valuadorEmail];
  const ccs: string[] = [];
  if (ctx.vendedorEmail && ctx.vendedorEmail !== ctx.valuadorEmail) {
    ccs.push(ctx.vendedorEmail);
  }

  const { subject, html } = renderTemplate(ctx);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      cc: ccs.length > 0 ? ccs : undefined,
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.warn(`[avaluo-emails] resend ${resp.status}: ${errText.slice(0, 400)}`);
    return { ok: false, sentTo: recipients, error: `resend ${resp.status}` };
  }
  return { ok: true, sentTo: [...recipients, ...ccs] };
}

function fechaTextoMx(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'Etc/GMT+6',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function caracteristicasInmueble(ctx: AvaluoSolicitudContext): string {
  const partes: string[] = [];
  if (ctx.esquina) partes.push('Esquina');
  if (ctx.tieneFrenteVerde) partes.push('Frente verde');
  return partes.length === 0 ? '—' : partes.join(' · ');
}

function renderTemplate(ctx: AvaluoSolicitudContext): { subject: string; html: string } {
  const fecha = fechaTextoMx();
  const ref = `${ctx.proyectoNombre} · ${ctx.unidadIdentificador}`;
  const saludoNombre = ctx.valuadorContacto?.trim() || ctx.valuadorNombre;

  const datosInmueble = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Datos del inmueble a valuar',
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
      { label: 'CARACTERÍSTICAS', value: caracteristicasInmueble(ctx) },
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

  const datosContactoVentas = renderSeccionDatos({
    branding: ctx.branding,
    titulo: 'Contacto para coordinar la visita',
    filas: [
      { label: 'GERENCIA DE VENTAS', value: ctx.vendedorNombre || null },
      { label: 'CORREO', value: ctx.vendedorEmail || null },
      { label: 'TELÉFONO', value: ctx.vendedorTelefono ?? null },
    ],
  });

  const bodyHtml = `
    <p style="font-size: 15px;">Estimado(a) <b>${escapeHtml(saludoNombre)}</b>,</p>
    <p>Por medio del presente solicitamos sus amables servicios para realizar el
       <b>avalúo comercial</b> de la siguiente vivienda en proceso de venta. A
       continuación encontrará los datos del inmueble y del comprador, así
       como los datos de contacto del responsable comercial para coordinar
       la visita y la entrega del dictamen.</p>
    ${datosInmueble}
    ${datosCliente}
    ${datosContactoVentas}
    <p style="margin-top: 20px;">Una vez concluido el avalúo, le agradeceremos
       hacer llegar el dictamen al gerente de ventas indicado arriba para su
       captura en nuestro sistema. Quedamos atentos a cualquier solicitud
       adicional de información.</p>
    <p style="margin-top: 24px;">Agradecemos su atención y quedamos a sus órdenes,<br/>
       <b>Equipo DILESA</b></p>
  `.trim();

  const subject = `Solicitud de avalúo — ${ref}`;
  const html = renderEmailLayout({
    branding: ctx.branding,
    titulo: 'SOLICITUD DE AVALÚO',
    fechaTexto: fecha,
    bodyHtml,
  });
  return { subject, html };
}
