/**
 * Layout reusable para los emails transaccionales de DILESA.
 *
 * Replica el diseño de los templates Coda:
 *  - Header band verde olivo con texto "DILESA" + título del documento.
 *  - Fecha alineada a la derecha.
 *  - Cuerpo libre (`bodyHtml`).
 *  - Footer band verde olivo con "DESARROLLO INMOBILIARIO LOS ENCINOS",
 *    sitio web y teléfono.
 *
 * Implementado con tablas + inline CSS porque es el único patrón que
 * renderea consistente en Gmail, Outlook web, Apple Mail e iOS Mail.
 * Nada de Tailwind ni de @media queries fuera del cliente — todo
 * inline para compatibilidad máxima.
 */

const VERDE_DILESA = '#7C8A3F';
const VERDE_DILESA_DARK = '#5E6A2D';

export interface EmailLayoutInput {
  /** Texto grande del header band — ej. "BIENVENIDA", "DESASIGNACIÓN". */
  titulo: string;
  /** Fecha en es-MX, ej. "1 de Junio del 2026". */
  fechaTexto: string;
  /** Contenido HTML que va dentro del cuerpo, entre header y footer. */
  bodyHtml: string;
}

export function renderEmailLayout({ titulo, fechaTexto, bodyHtml }: EmailLayoutInput): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0; padding:0; background:#f4f4f4; font-family: Arial, Helvetica, sans-serif; color:#333;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff; max-width:600px; width:100%;">
          ${renderHeader(titulo)}
          ${renderFecha(fechaTexto)}
          <tr>
            <td style="padding: 12px 32px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          ${renderFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function renderHeader(titulo: string): string {
  return `
    <tr>
      <td style="background:${VERDE_DILESA}; padding: 20px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: middle; width: 100px;">
              <div style="display:inline-block; background:#ffffff; padding:8px 12px; border-radius:4px; border:2px solid ${VERDE_DILESA_DARK};">
                <span style="font-size: 22px; font-weight: 700; letter-spacing: 1px; color:${VERDE_DILESA}; font-family: Georgia, serif;">DILESA</span>
              </div>
            </td>
            <td align="right" style="vertical-align: middle;">
              <h1 style="color:#ffffff; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: 1px;">${escapeHtml(
                titulo
              )}</h1>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function renderFecha(fechaTexto: string): string {
  return `
    <tr>
      <td align="right" style="padding: 16px 32px 0; color: #888; font-size: 13px;">
        ${escapeHtml(fechaTexto)}
      </td>
    </tr>
  `;
}

function renderFooter(): string {
  return `
    <tr>
      <td style="background:${VERDE_DILESA}; padding: 20px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="color:#ffffff; font-size: 13px; vertical-align: middle;">
              <strong style="font-size: 15px; letter-spacing: 0.5px;">DESARROLLO INMOBILIARIO LOS ENCINOS</strong><br/>
              <span style="opacity: 0.95;">dilesa.mx &nbsp;&middot;&nbsp; (878) 791-1818</span>
            </td>
            <td align="right" style="vertical-align: middle; width: 100px;">
              <div style="display:inline-block; background:#ffffff; padding:6px 10px; border-radius:4px; border:2px solid ${VERDE_DILESA_DARK};">
                <span style="font-size: 16px; font-weight: 700; letter-spacing: 1px; color:${VERDE_DILESA}; font-family: Georgia, serif;">DILESA</span>
              </div>
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
  titulo: string;
  filas: Array<{ label: string; value: string | null | undefined }>;
}

export function renderSeccionDatos({ titulo, filas }: SeccionDatos): string {
  const filasHtml = filas
    .filter((f) => f.value != null && f.value !== '')
    .map(
      (f) => `
        <tr>
          <td style="padding: 4px 0; color: ${VERDE_DILESA_DARK}; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; vertical-align: top; white-space: nowrap;">
            ${escapeHtml(f.label)}:
          </td>
          <td style="padding: 4px 0 4px 12px; color: #333; font-weight: 600; font-size: 14px;">
            ${escapeHtml(String(f.value))}
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <h2 style="color: ${VERDE_DILESA_DARK}; font-size: 14px; font-weight: 700; letter-spacing: 1.5px; margin: 16px 0 8px; text-transform: uppercase;">
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
export function pillIdentificador(value: string): string {
  return `<span style="display:inline-block; background:#f5f5f0; border:1px solid #d4d4c8; padding:2px 8px; border-radius:3px; font-family:'Courier New', monospace; font-size: 13px; font-weight: 600; color: #333;">${escapeHtml(
    value
  )}</span>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
