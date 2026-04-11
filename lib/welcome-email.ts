// ── Welcome email HTML generator for BSOP ──────────────────────────────────

export type WelcomeEmpresa = {
  nombre: string;
  logoUrl: string;
  rol: string;
  modulos: string[];
};

export function generateWelcomeHtml(firstName: string, empresas: WelcomeEmpresa[]): string {
  const empresaRows = empresas
    .map(
      (e) => `
      <div style="display:flex;align-items:flex-start;gap:16px;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #e5e5e5">
        <div style="width:56px;height:56px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <img src="${e.logoUrl}" alt="${e.nombre}" width="46" height="46" style="object-fit:contain"/>
        </div>
        <div style="padding-top:4px">
          <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a">${e.nombre}</p>
          <p style="margin:0 0 2px;font-size:13px;color:#666">Rol: <strong>${e.rol}</strong></p>
          <p style="margin:0;font-size:12px;color:#888">${e.modulos.join(' · ')}</p>
        </div>
      </div>`,
    )
    .join('\n')
    // Remove border from last item
    .replace(
      /border-bottom:1px solid #e5e5e5">\s*$/m,
      '">\n      </div>',
    );

  return `
<div style="max-width:480px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
  <div style="background:#f8f8f8;padding:28px 32px;text-align:center;border-bottom:1px solid #e5e5e5">
    <img src="https://bsop.io/logo-bsop.jpg" alt="BSOP" width="160" style="display:block;margin:0 auto"/>
  </div>
  <div style="padding:32px 32px 24px">
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a">¡Bienvenido a BSOP! 🦞</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.5">Hola <strong>${firstName}</strong>, se creó tu cuenta para acceder al sistema operativo de nuestras empresas.</p>
    <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 14px;font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px">Tu acceso</p>
      ${empresaRows}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 auto">
      <tr><td align="center">
        <a href="https://bsop.io" style="display:inline-block;background:#F7941D;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.3px">Ir a BSOP</a>
      </td></tr>
    </table>
    <div style="margin:24px 0 0;background:#FFF8F0;border-radius:8px;padding:16px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a1a">📱 Cómo iniciar sesión</p>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6">
        1. Entra a <a href="https://bsop.io" style="color:#F7941D">bsop.io</a><br/>
        2. Inicia sesión con tu correo corporativo usando Google<br/>
        3. Si no usas Google, puedes ingresar con un enlace mágico a tu correo
      </p>
    </div>
  </div>
  <div style="background:#f8f8f8;padding:16px 32px;text-align:center;border-top:1px solid #e5e5e5">
    <p style="margin:0 0 4px;font-size:13px;color:#555">¿Dudas? Contacta a tu administrador.</p>
    <p style="margin:0;font-size:11px;color:#999">BSOP · Sistema Operativo</p>
  </div>
</div>`;
}
