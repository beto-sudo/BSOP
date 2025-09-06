// app/api/switch-company/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { setCurrentCompanyCookie } from "@/lib/company";
import type { Database } from "@/types/supabase";

export async function POST(req: Request) {
  const { companyId } = await req.json().catch(() => ({} as any));
  const supabase = createServerClient<Database>();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // Si viene null/undefined => limpiar cookie (branding BSOP)
  if (!companyId) {
    await setCurrentCompanyCookie(null);
    return NextResponse.json({ ok: true, cleared: true });
  }

  // Verificar membresía
  const { data: cm } = await supabase
    .from("company_member")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (!cm) return NextResponse.json({ error: "Sin acceso a la empresa" }, { status: 403 });

  await setCurrentCompanyCookie(companyId);
  return NextResponse.json({ ok: true });
}
