import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { PREVIEW_COOKIE_NAME } from '@/lib/auth/preview-guard';
import { isPublicPath } from '@/lib/auth/public-paths';
// NOTE: The 'core' schema must be listed in Supabase Dashboard → Settings → API → Exposed Schemas.

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * `/api/**` mutation paths that must work even while a preview session is
 * active. Without these exemptions an admin in preview mode could not exit
 * ("stop") and could not switch targets ("impersonate" again).
 */
const PREVIEW_EXEMPT_API_PATHS = new Set(['/api/impersonate', '/api/impersonate/stop']);

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

  // Read-only enforcement while "Viendo como" is active. Reject any mutation
  // request to /api/** when the preview cookie is set, except the management
  // endpoints (/api/impersonate, /api/impersonate/stop) which must keep
  // working so admins can switch targets or exit preview.
  if (
    MUTATION_METHODS.has(request.method) &&
    pathname.startsWith('/api/') &&
    !PREVIEW_EXEMPT_API_PATHS.has(pathname) &&
    request.cookies.get(PREVIEW_COOKIE_NAME)?.value
  ) {
    return NextResponse.json(
      {
        error:
          'Modo vista previa activo: las acciones están deshabilitadas. Salí del preview para continuar.',
      },
      { status: 403 }
    );
  }

  return response;
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
