// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

async function resolveContext(req: NextRequest, slug: string) {
  // sesión del usuario (RLS) usando cookies
  const cookieStore = cookies();
  const supaSSR = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: auth } = await supaSSR.auth.getUser();
  const user = auth.user;
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  // 1) companyId por slug
  const { data: company, error: cErr } = await admin
    .from("Company")
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (cErr || !company) return { error: NextResponse.json({ error: "Company not found" }, { status: 404 }) };

  // 2) resolver profile.id (puede no ser igual al auth.user.id)
  let profileId: string | null = null;

  const { data: pById } = await admin.from("profile").select("id,email").eq("id", user.id).maybeSingle();
  if (pById) profileId = pById.id;
  else {
    const { data: pByEmail } = await admin.from("profile").select("id,email").eq("email", user.email ?? "").maybeSingle();
    if (pByEmail) profileId = pByEmail.id;
  }
  if (!profileId) return { error: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };

  // 3) membership
  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();

  if (!member) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, companyId: company.id as string };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const size = Math.min(100, Math.max(1, parseInt(searchParams.get("size") || "20", 10)));
  const ctx = await resolveContext(req, slug);
  if ("error" in ctx) return ctx.error;
  const { companyId } = ctx;

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
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();
  const ctx = await resolveContext(req, slug);
  if ("error" in ctx) return ctx.error;
  const { companyId } = ctx;

  const body = await req.json().catch(() => ({}));
  const name = (body?.name || "").trim();
  const sku = (body?.sku || "").trim();

  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { data, error } = await admin
    .from("Product")
    .insert([{ companyId, name, sku, isActive: true }])
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
