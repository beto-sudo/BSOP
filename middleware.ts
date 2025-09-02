// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set<string>([
  "/signin",
]);

function isStatic(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/public") ||
    pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$/) !== null
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isStatic(pathname)) return NextResponse.next();

  // APIs siempre pasan
  if (pathname.startsWith("/api")) return NextResponse.next();

  // Si venimos de OAuth (hay code en la URL), deja pasar para que el cliente intercambie
  const hasOAuthCode = req.nextUrl.searchParams.has("code");
  if (hasOAuthCode) return NextResponse.next();

  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));

  // Sin sesión y ruta no pública => manda a /signin con redirect
  if (!session && !PUBLIC_PATHS.has(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(url);
  }

  // Con sesión, evita /signin
  if (session && pathname === "/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Aplica a todo lo que no tenga extensión (para no re-evaluar estáticos)
  matcher: ["/((?!.*\\.).*)"],
};
