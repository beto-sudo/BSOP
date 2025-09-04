// app/api/company/lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function ssr(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") || "").toLowerCase().trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const supa = ssr(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // company
  const { data: company } = await admin
    .from("Company")
    .select("id,name,legalName,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // membership (profile.id == auth.uid() o por email si hubo migraciones)
  let profileId: string | null = null;
  const { data: pById } = await admin.from("profile").select("id,email").eq("id", user.id).maybeSingle();
  if (pById?.id) profileId = pById.id;
  if (!profileId) {
    const { data: pByEmail } = await admin.from("profile").select("id,email").eq("email", user.email ?? "").maybeSingle();
    if (pByEmail?.id) profileId = pByEmail.id;
  }
  if (!profileId) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: company.id,
    slug: company.slug,
    name: company.legalName || company.name || company.slug,
    displayName: company.legalName || company.name || company.slug,
  });
}
