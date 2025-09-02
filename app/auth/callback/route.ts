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

  const { error } = await supabase.auth.exchangeCodeForSession(req.url);
  if (error) {
    return redirectWithError(url.origin, redirect, "oauth", error.message || error.name);
  }

  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData?.session) {
    return redirectWithError(url.origin, redirect, "no_session", sessErr?.message || "No session after exchange");
  }

  return res;
}
