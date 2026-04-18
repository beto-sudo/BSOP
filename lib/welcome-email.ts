// ── Welcome email HTML generator for BSOP ──────────────────────────────────

export type WelcomeEmpresa = {
  nombre: string;
  logoUrl: string;
  rol: string;
  modulos: string[];
};

export function generateWelcomeHtml(firstName: string, empresas: WelcomeEmpresa[]): string {
  const empresaRows = empresas
    .map((e, i) => {
      const borderBottom = i < empresas.length - 1 ? 'border-bottom:1px solid #e5e5e5;' : '';
      const modulosHtml =
        e.modulos.length > 0
          ? `<tr><td colspan="2" style="padding:4px 0 0 0;font-size:12px;color:#888;line-height:1.4">${e.modulos.join(' · ')}</td></tr>`
          : '';
      return `
        <tr>
          <td style="padding:14px 0;${borderBottom}" colspan="2">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="52" valign="top" style="padding-right:14px">
                  <img src="${e.logoUrl}" alt="${e.nombre}" width="46" height="46" style="display:block;border-radius:6px;object-fit:contain;background:#fff"/>
                </td>
                <td valign="top">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="font-size:15px;font-weight:600;color:#1a1a1a;padding-bottom:2px">${e.nombre}</td></tr>
                    <tr><td style="font-size:13px;color:#666">Rol: <strong>${e.rol}</strong></td></tr>
                    ${modulosHtml}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('\n');

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f0f0">
<tr><td align="center" style="padding:24px 16px">

  <!-- Main card -->
  <table cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e5e5e5">

    <!-- Header with logo -->
    <tr>
      <td style="background:#f8f8f8;padding:28px 32px;text-align:center;border-bottom:1px solid #e5e5e5;border-radius:12px 12px 0 0">
        <img src="https://bsop.io/logo-bsop.jpg" alt="BSOP" width="160" style="display:block;margin:0 auto"/>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:32px 32px 24px">

        <!-- Title -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-size:22px;font-weight:700;color:#1a1a1a;padding-bottom:8px">¡Bienvenido a BSOP! 🦞</td></tr>
          <tr><td style="font-size:15px;color:#555;line-height:1.5;padding-bottom:24px">Hola <strong>${firstName}</strong>, se creó tu cuenta para acceder al sistema operativo de nuestras empresas.</td></tr>
        </table>

        <!-- Empresas card -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8f8f8;border-radius:8px">
          <tr>
            <td style="padding:20px">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:14px">Tu acceso</td></tr>
                ${empresaRows}
              </table>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding-top:24px">
          <tr><td align="center">
            <a href="https://bsop.io" style="display:inline-block;background:#F7941D;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">Ir a BSOP</a>
          </td></tr>
        </table>

        <!-- Login instructions -->
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;background:#FFF8F0;border-radius:8px">
          <tr>
            <td style="padding:16px">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="font-size:13px;font-weight:600;color:#1a1a1a;padding-bottom:8px">📱 Cómo iniciar sesión</td></tr>
                <tr><td style="font-size:13px;color:#555;line-height:1.6">
                  1. Entra a <a href="https://bsop.io" style="color:#F7941D">bsop.io</a><br/>
                  2. Inicia sesión con tu correo corporativo usando Google<br/>
                  3. Si no usas Google, puedes ingresar con un enlace mágico a tu correo
                </td></tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f8f8f8;padding:16px 32px;text-align:center;border-top:1px solid #e5e5e5;border-radius:0 0 12px 12px">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="font-size:13px;color:#555;padding-bottom:4px">¿Dudas? Contacta a tu administrador.</td></tr>
          <tr><td align="center" style="font-size:11px;color:#999">BSOP · Sistema Operativo</td></tr>
        </table>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}
