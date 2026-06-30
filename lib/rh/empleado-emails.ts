/**
 * Avisos de alta / baja de personal al comité — continuación (Fase 2) de la
 * iniciativa `notificaciones-catalogo`. Replica el correo que Coda mandaba al
 * dar de alta / baja a un empleado:
 *
 *  - ALTA → el comité pasa a darle la bienvenida personalmente, con los datos
 *    del ingreso + recordatorio de crear accesos (si aplica).
 *  - BAJA → recordatorio de revocar usuarios y accesos de la persona, con los
 *    datos de la baja + checklist de accesos.
 *
 * Recipients: el comité de la empresa, vía catálogo `core.notification_definitions`
 * slugs `empleado_alta` / `empleado_baja` (por empresa; hoy ambas empresas →
 * comite@dilesa.mx como recipient `always`, editable runtime sin deploy).
 *
 * Idempotencia: `erp.empleados.notif_alta_at` / `notif_baja_at`. El endpoint
 * decide (auto vs reenviar vs prueba); aquí solo se renderiza y envía. Mismo
 * patrón que `lib/dilesa/escrituracion-emails.ts`.
 */

import { renderEmailLayout, renderSeccionDatos, escapeHtml } from '../dilesa/email-layout';
import type { EmpresaBranding } from '../dilesa/email-branding';

export type EmpleadoAvisoTipo = 'alta' | 'baja';

/** Fallbacks si el catálogo no responde (FAIL-OPEN, patrón escrituración). */
export const EMPLEADO_ALTA_SLUG = 'empleado_alta';
export const EMPLEADO_BAJA_SLUG = 'empleado_baja';
export const EMPLEADO_FROM_FALLBACK = 'DILESA <noreply@bsop.io>';
export const EMPLEADO_REPLY_TO_FALLBACK = 'comite@dilesa.mx';
export const EMPLEADO_EXTRA_TO_FALLBACK = ['comite@dilesa.mx'];
export const EMPLEADO_ALTA_SUBJECT_FALLBACK = 'Nueva alta de personal — {nombre} ({puesto})';
export const EMPLEADO_BAJA_SUBJECT_FALLBACK = 'Baja de personal — {nombre} ({puesto})';

export function empleadoSlug(tipo: EmpleadoAvisoTipo): string {
  return tipo === 'alta' ? EMPLEADO_ALTA_SLUG : EMPLEADO_BAJA_SLUG;
}

export function empleadoSubjectFallback(tipo: EmpleadoAvisoTipo): string {
  return tipo === 'alta' ? EMPLEADO_ALTA_SUBJECT_FALLBACK : EMPLEADO_BAJA_SUBJECT_FALLBACK;
}

export interface EmpleadoAvisoContext {
  tipo: EmpleadoAvisoTipo;
  empleadoId: string;
  empresaId: string;
  /** Datos de la persona / empleado. */
  nombre: string;
  puesto: string | null;
  departamento: string | null;
  empresaNombre: string;
  /** ISO date `YYYY-MM-DD`. */
  fechaIngreso: string | null;
  tipoContrato: string | null;
  lugarTrabajo: string | null;
  correoEmpresa: string | null;
  /** Solo BAJA (ISO date + texto libre). */
  fechaBaja: string | null;
  motivoBaja: string | null;
  /** Branding (header + colores) — viene de loadEmpresaBranding. */
  branding: EmpresaBranding;
}

/** Destinatarios + sobre ya resueltos por el endpoint (catálogo o fallback). */
export interface EmpleadoAvisoDelivery {
  from: string;
  replyTo: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
}

export interface SendEmpleadoAvisoResult {
  ok: boolean;
  sentTo: string[];
  resendId: string | null;
  error?: string;
}

/**
 * Envía el aviso de alta / baja. Una falla NO bloquea la operación principal
 * (el alta o la baja del empleado ya se registró) — el caller loguea y el
 * operador puede reintentar con el botón "Reenviar aviso" del expediente.
 */
export async function sendEmpleadoAvisoEmail(
  ctx: EmpleadoAvisoContext,
  delivery: EmpleadoAvisoDelivery
): Promise<SendEmpleadoAvisoResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[empleado-emails] RESEND_API_KEY missing — skipping');
    return { ok: false, sentTo: [], resendId: null, error: 'RESEND_API_KEY missing' };
  }
  if (delivery.to.length === 0) {
    return { ok: false, sentTo: [], resendId: null, error: 'sin destinatarios' };
  }

  const html = renderEmpleadoAvisoHtml(ctx);

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
    console.warn(`[empleado-emails] resend ${resp.status}: ${errText.slice(0, 400)}`);
    return { ok: false, sentTo: delivery.to, resendId: null, error: `resend ${resp.status}` };
  }
  const body = (await resp.json().catch(() => null)) as { id?: string } | null;
  return {
    ok: true,
    sentTo: [...delivery.to, ...delivery.cc, ...delivery.bcc],
    resendId: body?.id ?? null,
  };
}

/**
 * Formatea un ISO date (`YYYY-MM-DD`) como "1 de julio de 2026" sin arrastre de
 * timezone (parsear con `new Date('YYYY-MM-DD')` en GMT-6 regresaría el día
 * anterior). Devuelve null si la fecha es nula/inválida.
 */
function fechaLargaMx(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
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

/** Antigüedad textual entre ingreso y baja (años, meses) — null si falta data. */
export function calcAntiguedad(
  fechaIngreso: string | null,
  fechaBaja: string | null
): string | null {
  if (!fechaIngreso || !fechaBaja) return null;
  const a = fechaIngreso.slice(0, 10).split('-').map(Number);
  const b = fechaBaja.slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || !a[0] || !b[0]) return null;
  let meses = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) meses -= 1;
  if (meses < 0) return null;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes: string[] = [];
  if (anios > 0) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`);
  return partes.length ? partes.join(', ') : 'Menos de un mes';
}

/** Render del HTML completo — exportado para previews/pruebas. */
export function renderEmpleadoAvisoHtml(ctx: EmpleadoAvisoContext): string {
  const b = ctx.branding;
  return ctx.tipo === 'alta' ? renderAltaHtml(ctx, b) : renderBajaHtml(ctx, b);
}

function renderAltaHtml(ctx: EmpleadoAvisoContext, b: EmpresaBranding): string {
  const datos = renderSeccionDatos({
    branding: b,
    titulo: 'Datos del ingreso',
    filas: [
      { label: 'NOMBRE', value: ctx.nombre },
      { label: 'PUESTO', value: ctx.puesto },
      { label: 'DEPARTAMENTO', value: ctx.departamento },
      { label: 'EMPRESA', value: ctx.empresaNombre },
      { label: 'FECHA DE INGRESO', value: fechaLargaMx(ctx.fechaIngreso) },
      { label: 'TIPO DE CONTRATO', value: ctx.tipoContrato },
      { label: 'LUGAR DE TRABAJO', value: ctx.lugarTrabajo },
      { label: 'CORREO ASIGNADO', value: ctx.correoEmpresa },
    ],
  });

  const bienvenida = `
    <p style="margin: 20px 0 16px; padding: 14px 16px; background: ${b.colorFondoBrand}; border-left: 4px solid ${b.colorPrimario}; font-size: 14px; color: ${b.colorTextoTitulo};">
      👋 <b>Pásenle a darle la bienvenida.</b> Un saludo del comité en su primer
      día hace la diferencia.
    </p>`;
  const accesos = `
    <p style="margin: 12px 0 16px; padding: 14px 16px; background: ${b.colorFondoBrand}; border-left: 4px solid ${b.colorPrimario}; font-size: 14px; color: ${b.colorTextoTitulo};">
      🔑 <b>Accesos por crear (si aplica):</b> correo corporativo, usuario en BSOP
      y sistemas, gafete / accesos físicos, equipo de cómputo.
    </p>`;

  const bodyHtml = `
    <p style="font-size: 15px;">Estimado comité:</p>
    <p>Les informamos que se registró el <b>alta de un nuevo integrante</b> del
       equipo. Les pedimos pasar a <b>darle la bienvenida personalmente</b> y
       apoyarle en su incorporación.</p>
    ${datos}
    ${bienvenida}
    ${accesos}
    <p style="margin-top: 24px;">Bienvenida al equipo,<br/>
       <b>Recursos Humanos · ${escapeHtml(ctx.empresaNombre)}</b></p>
  `.trim();

  return renderEmailLayout({
    branding: b,
    titulo: 'NUEVA ALTA DE PERSONAL',
    fechaTexto: fechaHoyMx(),
    bodyHtml,
  });
}

function renderBajaHtml(ctx: EmpleadoAvisoContext, b: EmpresaBranding): string {
  const datos = renderSeccionDatos({
    branding: b,
    titulo: 'Datos de la baja',
    filas: [
      { label: 'NOMBRE', value: ctx.nombre },
      { label: 'PUESTO', value: ctx.puesto },
      { label: 'DEPARTAMENTO', value: ctx.departamento },
      { label: 'EMPRESA', value: ctx.empresaNombre },
      { label: 'FECHA DE INGRESO', value: fechaLargaMx(ctx.fechaIngreso) },
      { label: 'FECHA DE BAJA', value: fechaLargaMx(ctx.fechaBaja) },
      { label: 'ANTIGÜEDAD', value: calcAntiguedad(ctx.fechaIngreso, ctx.fechaBaja) },
      { label: 'MOTIVO', value: ctx.motivoBaja },
    ],
  });

  const correoLinea = ctx.correoEmpresa ? ` (${escapeHtml(ctx.correoEmpresa)})` : '';
  const revocar = `
    <p style="margin: 20px 0 16px; padding: 14px 16px; background: ${b.colorFondoBrand}; border-left: 4px solid #B23B3B; font-size: 14px; color: ${b.colorTextoTitulo};">
      🔒 <b>Revocar accesos de inmediato:</b><br/>
      <span style="display:inline-block; margin-top:6px; line-height:1.9;">
        ☐ Correo corporativo${correoLinea}<br/>
        ☐ Usuario BSOP y sistemas (CONTPAQi, etc.)<br/>
        ☐ Grupos de Workspace / listas de correo<br/>
        ☐ Accesos físicos: llaves, tarjetas, gafete<br/>
        ☐ Equipo de cómputo / dispositivos asignados
      </span>
    </p>`;

  const bodyHtml = `
    <p style="font-size: 15px;">Estimado comité:</p>
    <p>Les informamos que se registró la <b>baja de un integrante</b> del equipo.
       Este aviso sirve de <b>recordatorio para dar de baja sus usuarios y
       accesos</b> de forma oportuna.</p>
    ${datos}
    ${revocar}
    <p style="margin-top: 24px;">Atentamente,<br/>
       <b>Recursos Humanos · ${escapeHtml(ctx.empresaNombre)}</b></p>
  `.trim();

  return renderEmailLayout({
    branding: b,
    titulo: 'BAJA DE PERSONAL',
    fechaTexto: fechaHoyMx(),
    bodyHtml,
  });
}
