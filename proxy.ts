import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
// NOTE: The 'core' schema must be listed in Supabase Dashboard → Settings → API → Exposed Schemas.

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/auth/callback' ||
    pathname === '/api/auth/google' ||
    pathname.startsWith('/compartir/') ||
    pathname.startsWith('/api/usage/') ||
    pathname === '/api/health/ingest' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo-bs.png' ||
    pathname === '/logo-bs.jpg' ||
    pathname === '/logo-bsop.jpg' ||
    pathname === '/membrete-rdb.jpg'
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '?error=unauthorized';
    return NextResponse.redirect(loginUrl, { headers: response.headers });
  }

  // Check core.usuarios with service role key (bypasses RLS).
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: usuario } = await adminClient
    .schema('core')
    .from('usuarios')
    .select('activo')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle();

  // Admin bypass: if the user is authenticated via Supabase but has no row in
  // core.usuarios yet, optionally let them through if their email matches the
  // ADMIN_BYPASS_EMAIL env var. Without that env var, the app defaults to the
  // safest behavior (deny). This bypass should be temporary — once all admins
  // are provisioned in core.usuarios, remove the var and this branch.
  const adminBypassEmail = process.env.ADMIN_BYPASS_EMAIL?.toLowerCase();
  if (!usuario && email !== adminBypassEmail) {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '?error=unauthorized';
    return NextResponse.redirect(loginUrl, { headers: response.headers });
  }

  if (!usuario && adminBypassEmail) {
    // Surface admin bypass usage in runtime logs so it stays visible.
    console.warn(`[proxy] ADMIN_BYPASS_EMAIL used by ${email}`);
  }

  if (pathname === '/login') {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = '/';
    appUrl.search = '';
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
