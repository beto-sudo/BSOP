// app/api/admin/is-superadmin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isSuperadminEmail(email?: string | null) {
  const raw = process.env.BSOP_SUPERADMINS || "";
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

function ssrFromRequest(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const supa = ssrFromRequest(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const email = auth.user?.email ?? null;

  const is = isSuperadminEmail(email);

  // modo debug: /api/admin/is-superadmin?debug=1
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  if (debug) {
    const raw = process.env.BSOP_SUPERADMINS || "";
    const list = raw.split(",").map(s => s.trim()).filter(Boolean);
    return NextResponse.json({ is, email, superadmins_config: list });
  }

  return NextResponse.json({ is });
}
