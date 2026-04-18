import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  console.log('[auth/callback] hit', {
    code: code ? code.slice(0, 8) + '...' : null,
    next,
    origin,
  });

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            console.log(
              '[auth/callback] setAll called with',
              cookiesToSet.length,
              'cookies:',
              cookiesToSet.map((c) => c.name)
            );
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
              console.log('[auth/callback] cookies set OK');
            } catch (error) {
              console.error('[auth/callback] Error setting cookies', error);
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchange error:', error.message);
      return NextResponse.redirect(new URL('/login?error=exchange_failed', origin));
    }
    console.log('[auth/callback] exchange OK, user:', data.user?.email);
  } else {
    console.log('[auth/callback] no code param');
  }

  const redirectUrl = new URL(next, origin);
  console.log('[auth/callback] redirecting to:', redirectUrl.toString());
  return NextResponse.redirect(redirectUrl);
}
