// app/api/is-superadmin/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/types/supabase";

export async function GET() {
  try {
    const supabase = createServerClient<Database>();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ isSuperadmin: false });

    // 1) app_metadata (si lo usas)
    const role = (user.app_metadata as any)?.role;
    if (role === "superadmin") return NextResponse.json({ isSuperadmin: true });

    // 2) profile.is_superadmin (si lo tienes en DB)
    const { data: prof } = await supabase
      .from("profile")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({ isSuperadmin: !!prof?.is_superadmin });
  } catch {
    return NextResponse.json({ isSuperadmin: false });
  }
}
