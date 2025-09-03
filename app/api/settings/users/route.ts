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

    // 1) Miembros activos (company_member) + perfil (profile)
    //    Asumo que profile tiene columnas: user_id, full_name, avatar_url, locale, email
    const { data: members, error: mErr } = await supabaseAdmin
      .from("company_member")
      .select(
        `
        company_id,
        user_id,
        is_active,
        profile:user_id (
          full_name,
          avatar_url,
          locale,
          email
        )
      `
      )
      .eq("company_id", companyId);

    if (mErr) {
      console.error("company_member select error:", mErr);
      return NextResponse.json({ rows: [], count: 0 });
    }

    const memberRows =
      (members || []).map((m: any) => ({
        member_id: `${m.company_id}:${m.user_id}`,
        company_id: m.company_id,
        user_id: m.user_id,
        email: m?.profile?.email || "",
        full_name: m?.profile?.full_name || "",
        avatar_url: m?.profile?.avatar_url || "",
        locale: m?.profile?.locale || "es-MX",
        member_is_active: !!m?.is_active,
        profile_is_active: true,
        status: "active",
      })) || [];

    // 2) Invitaciones pendientes (invitation)
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
        status: "pending",
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
