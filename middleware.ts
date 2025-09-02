import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
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
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;
  const isAuth = pathname.startsWith("/signin") || pathname.startsWith("/auth");
  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/.test(pathname);

  if (!session && !isAuth && !isStatic) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirect", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"],
};
