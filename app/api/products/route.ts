// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Cliente ADMIN (server-only, no exponer en cliente)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SSR client desde la request (lee cookies para auth RLS)
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

/** Tipado discriminado para evitar “undefined” en retornos */
type AccessOk = { ok: true; companyId: string };
type AccessErr = { ok: false; resp: Response };

/** Verifica sesión + membership del usuario para la compañía (?company=slug) */
async function assertAccess(req: NextRequest, slug: string): Promise<AccessOk | AccessErr> {
  if (!slug) {
    return { ok: false, resp: NextResponse.json({ error: "Missing company" }, { status: 400 }) };
  }

  const supaSSR = ssrFromRequest(req);
  const { data: auth } = await supaSSR.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;
  if (!user) {
    return { ok: false, resp: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // 1) Company por slug
  const { data: company, error: cErr } = await admin
    .from("Company")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (cErr) return { ok: false, resp: NextResponse.json({ error: cErr.message }, { status: 500 }) };
  if (!company) return { ok: false, resp: NextResponse.json({ error: "Company not found" }, { status: 404 }) };

  // 2) profile.id puede no ser igual a auth.user.id → intenta por id y luego por email
  let profileId: string | null = null;
  const { data: pById } = await admin.from("profile").select("id,email").eq("id", user.id).maybeSingle();
  if (pById?.id) profileId = pById.id;
  if (!profileId) {
    const { data: pByEmail } = await admin
      .from("profile")
      .select("id,email")
      .eq("email", user.email ?? "")
      .maybeSingle();
    if (pByEmail?.id) profileId = pByEmail.id;
  }
  if (!profileId) return { ok: false, resp: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };

  // 3) membership
  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (!member) return { ok: false, resp: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { ok: true, companyId: company.id as string };
}

/* GET /api/products?company=slug[&q=..&page=1&size=20] */
export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const size = Math.min(100, Math.max(1, parseInt(searchParams.get("size") || "20", 10)));

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;
  const { companyId } = acc;

  try {
    let query = admin
      .from("Product")
      .select("*", { count: "exact" })
      .eq("companyId", companyId)
      .order("name", { ascending: true });

    if (q) {
      query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
    }

    const from = (page - 1) * size;
    const to = from + size - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, size });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

/* POST /api/products?company=slug   body: { name, sku? } */
export async function POST(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;
  const { companyId } = acc;

  try {
    const body = await req.json().catch(() => ({}));
    const name = (body?.name || "").trim();
    const sku = (body?.sku || "").trim();
    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

    const { data, error } = await admin
      .from("Product")
      .insert([{ companyId, name, sku: sku || null, isActive: true }])
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
