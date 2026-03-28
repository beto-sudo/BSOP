import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ALLOWED_EMAILS = new Set(['beto@anorte.com']);

function isPublicPath(pathname: string) {
  return (
    pathname === '/auth/callback' ||
    pathname.startsWith('/compartir/') ||
    pathname.startsWith('/api/usage/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo-bs.png' ||
    pathname === '/logo-bs.jpg' ||
    pathname === '/logo-bsop.jpg'
  );
}

export async function middleware(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
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
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  const email = session.user.email?.toLowerCase();
  if (!email || !ALLOWED_EMAILS.has(email)) {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '?error=unauthorized';
    return NextResponse.redirect(loginUrl, { headers: response.headers });
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
