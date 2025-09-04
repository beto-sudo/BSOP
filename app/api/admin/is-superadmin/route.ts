// app/api/admin/is-superadmin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSuperadminEmail } from "@/lib/superadmin";

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
  return NextResponse.json({ is: isSuperadminEmail(email) });
}
