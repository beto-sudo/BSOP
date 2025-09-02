// app/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") || "/";

  // Preparar respuesta editable para que supabase escriba cookies
  const res = NextResponse.redirect(new URL(redirect, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Intercambia ?code=... por sesión y setea cookies httpOnly
  const { error } = await supabase.auth.exchangeCodeForSession(req.url);
  if (error) {
    // si falla, regresa a /signin con mensaje
    const fail = new URL("/signin", url.origin);
    fail.searchParams.set("redirect", redirect);
    fail.searchParams.set("err", "oauth");
    return NextResponse.redirect(fail);
  }

  return res;
}
