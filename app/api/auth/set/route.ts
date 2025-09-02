// app/api/auth/set/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const { access_token, refresh_token } = await req.json().catch(() => ({} as any));

  if (!access_token || !refresh_token) {
    return new NextResponse("Missing tokens", { status: 400 });
  }

  // Prepara respuesta que podrá escribir cookies httpOnly
  const res = new NextResponse(null, { status: 204 });

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

  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    return new NextResponse(error.message || "setSession failed", { status: 400 });
  }

  return res;
}
