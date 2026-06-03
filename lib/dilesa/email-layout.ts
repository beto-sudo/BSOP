/**
 * Layout reusable para los emails transaccionales de DILESA (y, por
 * extensión, cualquier empresa BSOP).
 *
 * Toma el branding de la empresa (`EmpresaBranding`) y arma el layout
 * estándar:
 *   - Header band con la imagen `header_url` de la empresa (si existe),
 *     y debajo una barra del color primario con el título centrado.
 *   - Fecha alineada a la derecha.
 *   - Cuerpo libre (`bodyHtml`).
 *   - Footer band con el color primario, nombre comercial, sitio web y
 *     teléfono.
 *
 * Implementado con tablas + inline CSS para compatibilidad con todos
 * los clientes de email (Gmail, Outlook web, Apple Mail, iOS Mail).
 * Nada de Tailwind ni de @media queries fuera del cliente.
 */

import type { EmpresaBranding } from './email-branding';

export interface EmailLayoutInput {
  /** Branding cargado de `core.empresas` (ver `loadEmpresaBranding`). */
  branding: EmpresaBranding;
  /** Texto grande del header band — ej. "BIENVENIDA", "DESASIGNACIÓN". */
  titulo: string;
  /** Fecha en es-MX, ej. "1 de Junio del 2026". */
  fechaTexto: string;
  /** Contenido HTML que va dentro del cuerpo, entre header y footer. */
  bodyHtml: string;
}

export function renderEmailLayout({
  branding,
  titulo,
  fechaTexto,
  bodyHtml,
}: EmailLayoutInput): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0; padding:0; background:#f4f4f4; font-family: Arial, Helvetica, sans-serif; color:${branding.colorTextoTitulo};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff; max-width:600px; width:100%;">
          ${renderHeader(branding, titulo)}
          ${renderFecha(branding, fechaTexto)}
          <tr>
            <td style="padding: 12px 32px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          ${renderFooter(branding)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function renderHeader(branding: EmpresaBranding, titulo: string): string {
  // Si hay imagen del header, la usamos a width completo. Debajo va una
  // barra de color primario con el título centrado para que el operador
  // identifique de qué tipo de email se trata. Si no hay imagen, fallback
  // al header de solo barra de color con el nombre comercial.
  const headerImage = branding.headerUrl
    ? `
      <tr>
        <td style="padding: 0;">
          <img
            src="${escapeAttr(branding.headerUrl)}"
            alt="${escapeAttr(branding.nombreComercial)}"
            width="600"
            style="display:block; width:100%; max-width:600px; height:auto;"
          />
        </td>
      </tr>`
    : `
      <tr>
        <td style="background:${branding.colorPrimario}; padding: 24px 32px;">
          <span style="font-size: 24px; font-weight: 700; letter-spacing: 1.5px; color:${branding.colorInverso}; font-family: Georgia, serif;">${escapeHtml(branding.nombreComercial)}</span>
        </td>
      </tr>`;

  return `${headerImage}
    <tr>
      <td style="background:${branding.colorPrimarioDark}; padding: 12px 32px;">
        <h1 style="color:${branding.colorInverso}; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 2px; text-align: center;">${escapeHtml(titulo)}</h1>
      </td>
    </tr>
  `;
}

function renderFecha(branding: EmpresaBranding, fechaTexto: string): string {
  return `
    <tr>
      <td align="right" style="padding: 16px 32px 0; color: ${branding.colorSecundario}; font-size: 13px;">
        ${escapeHtml(fechaTexto)}
      </td>
    </tr>
  `;
}

function renderFooter(branding: EmpresaBranding): string {
  const contactoLine = [branding.sitioWeb, branding.telefono].filter(Boolean).join(' · ');
  return `
    <tr>
      <td style="background:${branding.colorPrimario}; padding: 20px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="color:${branding.colorInverso}; font-size: 13px; vertical-align: middle;">
              <strong style="font-size: 15px; letter-spacing: 0.5px;">${escapeHtml(branding.nombreComercial)}</strong>${
                contactoLine
                  ? `<br/><span style="opacity: 0.95;">${escapeHtml(contactoLine)}</span>`
                  : ''
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

/**
 * Renderea una sección con título estilo "DATOS DE LA VIVIENDA" + lista de
 * pares label/value en formato tabla (compat email clients).
 */
export interface SeccionDatos {
  branding: EmpresaBranding;
  titulo: string;
  filas: Array<{ label: string; value: string | null | undefined }>;
}

export function renderSeccionDatos({ branding, titulo, filas }: SeccionDatos): string {
  const filasHtml = filas
    .filter((f) => f.value != null && f.value !== '')
    .map(
      (f) => `
        <tr>
          <td style="padding: 4px 0; color: ${branding.colorPrimarioDark}; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(f.label)}:
          </td>
          <td style="padding: 4px 0 4px 12px; color: ${branding.colorTextoTitulo}; font-weight: 600; font-size: 14px;">
            ${escapeHtml(String(f.value))}
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <h2 style="color: ${branding.colorPrimarioDark}; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; margin: 16px 0 8px; text-transform: uppercase;">
      ${escapeHtml(titulo)}
    </h2>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
      ${filasHtml}
    </table>
  `;
}

/**
 * Pill / chip estilo Coda — fondo gris claro con borde y texto monospaced.
 * Útil para identificadores de inventario (M11-L19-LDLE-ISC).
 */
export function pillIdentificador(branding: EmpresaBranding, value: string): string {
  return `<span style="display:inline-block; background:${branding.colorFondoBrand}; border:1px solid ${branding.colorPrimario}; padding:2px 8px; border-radius:3px; font-family:'Courier New', monospace; font-size: 13px; font-weight: 600; color: ${branding.colorTextoTitulo};">${escapeHtml(
    value
  )}</span>`;
}

/**
 * Bloque destacado para el motivo de desasignación / cancelación.
 */
export function renderMotivoBloque(branding: EmpresaBranding, motivo: string): string {
  return `
    <h2 style="color: ${branding.colorPrimarioDark}; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; margin: 20px 0 8px; text-transform: uppercase;">
      Motivo de desasignación
    </h2>
    <p style="margin: 4px 0 16px; padding: 12px; background: ${branding.colorFondoBrand}; border-left: 4px solid ${branding.colorPrimario}; font-size: 14px; color: ${branding.colorTextoTitulo};">
      ${escapeHtml(motivo)}
    </p>
  `;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
