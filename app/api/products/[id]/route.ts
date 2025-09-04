// app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function assertAccess(req: NextRequest, slug: string) {
  const cookieStore = cookies();
  const supaSSR = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: auth } = await supaSSR.auth.getUser();
  const user = auth.user;
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: company } = await admin.from("Company").select("id").eq("slug", slug).maybeSingle();
  if (!company) return { error: NextResponse.json({ error: "Company not found" }, { status: 404 }) };

  const { data: pById } = await admin.from("profile").select("id").eq("id", user.id).maybeSingle();
  let profileId = pById?.id as string | undefined;
  if (!profileId) {
    const { data: pByEmail } = await admin.from("profile").select("id").eq("email", user.email ?? "").maybeSingle();
    profileId = pByEmail?.id;
  }
  if (!profileId) return { error: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };

  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (!member) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { companyId: company.id as string };
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase();
  const check = await assertAccess(req, slug);
  if ("error" in check) return check.error;
  const { companyId } = check;

  const id = ctx.params.id;
  const body = await req.json().catch(() => ({}));
  const patch: any = {};
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
