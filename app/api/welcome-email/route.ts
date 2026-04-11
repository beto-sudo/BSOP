import { NextRequest, NextResponse } from 'next/server';
import { generateWelcomeHtml, type WelcomeEmpresa } from '@/lib/welcome-email';

const LOGO_MAP: Record<string, string> = {
  rdb: 'https://bsop.io/logo-rdb.png',
  ansa: 'https://bsop.io/logo-ansa.png',
  dilesa: 'https://bsop.io/logo-dilesa.png',
  coagan: 'https://bsop.io/logo-coagan.png',
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, firstName, usuarioId } = body;

  console.log('[welcome-email-api] Received:', { email, firstName, usuarioId });

  if (!email || !usuarioId) {
    return NextResponse.json({ error: 'Missing email or usuarioId' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    console.error('[welcome-email-api] RESEND_API_KEY not found in env');
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  console.log('[welcome-email-api] RESEND_API_KEY found:', resendKey.substring(0, 6) + '...');

  // Fetch usuario_empresas
  const adminRes = await fetch(`${supabaseUrl}/rest/v1/usuarios_empresas?usuario_id=eq.${usuarioId}&select=empresa_id,roles:rol_id(nombre),empresas:empresa_id(slug,nombre)`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Profile': 'core',
    },
  });
  const usuarioEmpresas = await adminRes.json();
  console.log('[welcome-email-api] usuarioEmpresas:', JSON.stringify(usuarioEmpresas));

  const empresas: WelcomeEmpresa[] = [];

  if (Array.isArray(usuarioEmpresas) && usuarioEmpresas.length > 0) {
    for (const ue of usuarioEmpresas) {
      const empresaData = ue.empresas as { slug: string; nombre: string } | null;
      const rolData = ue.roles as { nombre: string } | null;
      if (!empresaData) continue;

      empresas.push({
        nombre: empresaData.nombre,
        logoUrl: LOGO_MAP[empresaData.slug] ?? 'https://bsop.io/logo-bsop.jpg',
        rol: rolData?.nombre ?? 'Pendiente de asignación',
        modulos: [],
      });
    }
  }

  if (empresas.length === 0) {
    empresas.push({
      nombre: 'BSOP',
      logoUrl: 'https://bsop.io/logo-bsop.jpg',
      rol: 'Pendiente de asignación',
      modulos: ['Por asignar'],
    });
  }

  const html = generateWelcomeHtml(firstName || email, empresas);

  console.log('[welcome-email-api] Sending email via Resend to:', email);

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'BSOP <noreply@bsop.io>',
      to: [email],
      subject: '¡Bienvenido a BSOP! Tu cuenta está lista',
      html,
    }),
  });

  const emailResult = await emailRes.json();
  console.log('[welcome-email-api] Resend response:', emailRes.status, JSON.stringify(emailResult));

  if (!emailRes.ok) {
    return NextResponse.json({ error: 'Resend failed', detail: emailResult }, { status: 500 });
  }

  return NextResponse.json({ success: true, emailId: emailResult.id });
}
