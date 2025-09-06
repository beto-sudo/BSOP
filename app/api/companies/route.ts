// app/api/companies/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

export async function GET() {
  const supabase = createServerClient<Database>();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ items: [] });

  const { data, error } = await supabase
    .from("company_member")
    .select("company_id, company:Company(id, name, slug, isActive)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 500 });

  const items = (data ?? [])
    .map((r) => r.company)
    .filter(Boolean)
    .filter((c) => c!.isActive)
    .map((c) => ({ id: c!.id, name: c!.name, slug: c!.slug }));

  return NextResponse.json({ items });
}
