// app/api/admin/memberships/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { isSuperadminEmail } from "@/lib/superadmin";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function ssrFromRequest(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

// -------- GET: devuelve usuarios, empresas y memberships ----------
export async function GET(req: NextRequest): Promise<Response> {
  const supa = ssrFromRequest(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;

  if (!user || !isSuperadminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: companies, error: cErr }, { data: users, error: uErr }, { data: memberships, error: mErr }] =
    await Promise.all([
      admin.from("Company").select("id,name,slug").order("name", { ascending: true }),
      admin.from("profile").select("id,email,first_name,last_name,is_active").order("email", { ascending: true }),
      admin.from("company_member").select("company_id,user_id"),
    ]);

  if (cErr || uErr || mErr) {
    const msg = cErr?.message || uErr?.message || mErr?.message || "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ companies: companies ?? [], users: users ?? [], memberships: memberships ?? [] });
}

// -------- POST: agrega o quita membresía ----------
export async function POST(req: NextRequest): Promise<Response> {
  const supa = ssrFromRequest(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;

  if (!user || !isSuperadminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId || "");
  const companyId = String(body?.companyId || "");
  const allow = Boolean(body?.allow);

  if (!userId || !companyId) {
    return NextResponse.json({ error: "Missing userId/companyId" }, { status: 400 });
  }

  // ¿Existe?
  const { data: exists } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (allow) {
    if (!exists) {
      const { error } = await admin.from("company_member").insert([{ company_id: companyId, user_id: userId }]);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    if (exists) {
      const { error } = await admin
        .from("company_member")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
