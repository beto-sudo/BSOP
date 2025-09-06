// app/api/current-company/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentCompanyIdFromCookies } from "@/lib/company";
import type { Database } from "@/types/supabase";

export async function GET() {
  try {
    const companyId = await getCurrentCompanyIdFromCookies();
    if (!companyId) {
      return NextResponse.json({ companyId: null, companyName: null });
    }

    const supabase = createServerClient<Database>();
    // Opcional: validar que el usuario tenga sesión
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Sin sesión, no expongas datos de empresa
      return NextResponse.json({ companyId: null, companyName: null }, { status: 200 });
    }

    // Opcional: validar pertenencia (mejor seguridad)
    const { data: member } = await supabase
      .from("company_member")
      .select("company_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!member) {
      // Si la cookie apunta a una empresa que el usuario no tiene, “limpia” de facto
      return NextResponse.json({ companyId: null, companyName: null }, { status: 200 });
    }

    const { data: company } = await supabase
      .from("Company")
      .select("id, name, isActive")
      .eq("id", companyId)
      .maybeSingle();

    if (!company || company.isActive === false) {
      return NextResponse.json({ companyId: null, companyName: null }, { status: 200 });
    }

    return NextResponse.json({ companyId: company.id, companyName: company.name });
  } catch (err) {
    return NextResponse.json(
      { companyId: null, companyName: null, error: "unexpected_error" },
      { status: 200 }
    );
  }
}
