// app/auth/callback/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function redirectWithError(origin: string, redirect: string, code: string, detail?: string) {
  const url = new URL("/signin", origin);
  url.searchParams.set("redirect", redirect || "/");
  url.searchParams.set("err", code);
  if (detail) url.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") || "/";

  // Preparamos la respuesta de redirección final (donde ya estará la sesión)
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

  // Intenta el intercambio
  const { error } = await supabase.auth.exchangeCodeForSession(req.url);

  if (error) {
    // Diagnóstico rápido en la URL para que sepamos exactamente qué pasó
    return redirectWithError(url.origin, redirect, "oauth", error.message || error.name);
  }

  // Extra: verifica que realmente haya sesión (defensa adicional)
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData?.session) {
    return redirectWithError(url.origin, redirect, "no_session", sessErr?.message || "No session after exchange");
  }

  return res;
}
