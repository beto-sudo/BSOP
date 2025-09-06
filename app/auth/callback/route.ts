import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirect = url.searchParams.get('redirect') || '/';
  const code = url.searchParams.get('code');

  if (!code) {
    // Manejo de error simple (puedes enviar a /signin con msg)
    return NextResponse.redirect(new URL(`/signin?error=missing_code`, url.origin));
  }

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(redirect, url.origin));
}
