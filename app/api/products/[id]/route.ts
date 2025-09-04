// app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Cliente ADMIN (server-only)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// SSR client desde la request (lee cookies para auth)
function ssrFromRequest(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set() { /* no necesitamos set en handlers */ },
        remove() {},
      },
    }
  );
}

/** Tipado discriminado para evitar “undefined” en el retorno */
type AccessOk = { ok: true; companyId: string };
type AccessErr = { ok: false; resp: Response };

/** Verifica sesión y membresía del usuario contra la compañía (por slug) */
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
  const { data: company } = await admin.from("Company").select("id").eq("slug", slug).maybeSingle();
  if (!company) {
    return { ok: false, resp: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
  }

  // 2) profile.id puede no ser igual a auth.user.id → intentar por id y por email
  let profileId: string | null = null;
  const { data: pById } = await admin.from("profile").select("id,email").eq("id", user.id).maybeSingle();
  if (pById?.id) {
    profileId = pById.id;
  } else {
    const { data: pByEmail } = await admin
      .from("profile")
      .select("id,email")
      .eq("email", user.email ?? "")
      .maybeSingle();
    if (pByEmail?.id) profileId = pByEmail.id;
  }
  if (!profileId) {
    return { ok: false, resp: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };
  }

  // 3) membership
  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();

  if (!member) {
    return { ok: false, resp: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, companyId: company.id as string };
}

// PATCH: editar nombre/sku/estado
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;
  const { companyId } = acc;

  const id = ctx.params.id;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.sku === "string") patch.sku = body.sku.trim();
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

  const { data, error } = await admin
    .from("Product")
    .update(patch)
    .eq("id", id)
    .eq("companyId", companyId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE: borrar producto
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;
  const { companyId } = acc;

  const id = ctx.params.id;
  const { error } = await admin.from("Product").delete().eq("id", id).eq("companyId", companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
