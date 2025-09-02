// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const redirectTo = url.searchParams.get("redirect") || "/";
  const res = NextResponse.redirect(new URL(redirectTo, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options: CookieOptions) => res.cookies.set({ name, value, ...options }),
        remove: (name, options: CookieOptions) => res.cookies.set({ name, value: "", ...options, maxAge: 0 }),
      },
    }
  );

  await supabase.auth.exchangeCodeForSession(); // crea cookies sb-*
  return res;
}
