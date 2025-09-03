// app/api/settings/users/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId")?.trim();
    const query = (url.searchParams.get("query") || "").trim().toLowerCase();

    if (!companyId) return NextResponse.json({ rows: [], count: 0 });

    // 1) Miembros vía la VISTA existente (company_member_view)
    //    Esta vista suele traer ya email / full_name / etc. La leemos "lo que haya".
    const { data: viewRows, error: vErr } = await supabaseAdmin
      .from("company_member_view")
      .select("*")
      .eq("company_id", companyId);

    if (vErr) {
      console.error("company_member_view error:", vErr);
    }

    const memberRows =
      (viewRows || []).map((r: any) => ({
        member_id: `${r.company_id}:${r.user_id}`,
        company_id: r.company_id,
        user_id: r.user_id,
        email: r.email || r.user_email || "",
        full_name: r.full_name || r.user_full_name || "",
        avatar_url: r.avatar_url || r.user_avatar_url || "",
        locale: r.locale || "es-MX",
        member_is_active: r.is_active ?? true,
        profile_is_active: true,
        status: "active" as const,
      })) || [];

    // 2) Invitaciones pendientes
    const { data: invites, error: iErr } = await supabaseAdmin
      .from("invitation")
      .select("id, email, role_id, invitation_url, status, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (iErr) console.error("invitation select error:", iErr);

    const inviteRows =
      (invites || []).map((i: any) => ({
        member_id: `invite:${i.id}`,
        company_id: companyId,
        user_id: "",
        email: i.email,
        full_name: "",
        avatar_url: "",
        locale: "es-MX",
        member_is_active: false,
        profile_is_active: false,
        status: "pending" as const,
        invitation_url: i.invitation_url || null,
      })) || [];

    // 3) Merge + filtro
    let rows = [...inviteRows, ...memberRows];
    if (query) {
      rows = rows.filter((r) => {
        const hay =
          (r.email || "").toLowerCase().includes(query) ||
          (r.full_name || "").toLowerCase().includes(query);
        return hay;
      });
    }

    return NextResponse.json({ rows, count: rows.length });
  } catch (e) {
    console.error("GET /settings/users", e);
    return NextResponse.json({ rows: [], count: 0 });
  }
}
