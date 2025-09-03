// app/api/settings/users/invitations/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const revalidate = 0;

type Body = {
  companyId?: string;
  email?: string;
  roleId?: string | null;
  invitedBy?: string | null;
};

function bad(msg: string, code = 400) {
  return new NextResponse(msg, { status: code });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const companyId = (body.companyId || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const roleId = body.roleId?.trim() || null;
    const invitedBy = body.invitedBy?.trim() || null;

    if (!companyId) return bad("companyId requerido", 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return bad("Email inválido", 400);
    }

    const redirectTo =
      (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "") +
        "/auth/callback" ||
      undefined;

    // 1) Generar invitación en AUTH → authUserId + link (funciona aunque no haya SMTP)
    let authUserId: string | undefined;
    let invitationUrl: string | undefined;

    const { data: linkData } = (await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    })) as any;

    authUserId = linkData?.user?.id;
    invitationUrl =
      linkData?.properties?.action_link || linkData?.action_link || null;

    if (!authUserId) {
      return bad("No se pudo crear usuario en Auth", 500);
    }

    // 2) Asegurar PROFILE (porque company_member.user_id → profile.id)
    let profileId: string | undefined;

    // a) buscar profile por email
    {
      const { data, error } = await supabaseAdmin
        .from("profile")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (!error && data?.id) profileId = data.id;
    }

    // b) si no existe, insertarlo con UUID
    if (!profileId) {
      const newId = randomUUID();
      const { data, error } = await supabaseAdmin
        .from("profile")
        .insert({
          id: newId,
          email,
          // puedes añadir aquí defaults opcionales si tu tabla los tiene:
          // full_name: null,
          // avatar_url: null,
          // locale: "es-MX",
        } as any)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("profile insert error:", error);
        return bad(`No se pudo crear profile: ${error.message || error}`, 500);
      }
      profileId = data?.id || newId;
    }

    // 3) Insertar en company_member con user_id = profileId
    const { data: cm, error: cmErr } = await supabaseAdmin
      .from("company_member")
      .insert({
        company_id: companyId,
        user_id: profileId,
        is_active: true,
      } as any)
      .select("id")
      .maybeSingle();

    if (cmErr) {
      console.error("company_member insert error:", cmErr);
      return bad(
        `No se pudo registrar en company_member: ${cmErr.message || cmErr}`,
        500
      );
    }
    const memberId = cm?.id;

    // 4) Rol inicial en member_role (tu tabla usa member_id + role_id)
    if (roleId && memberId) {
      const { error } = await supabaseAdmin
        .from("member_role")
        .insert({ member_id: memberId, role_id: roleId } as any);
      if (error) console.error("member_role insert error:", error);
    }

    // 5) Guardar la invitación para listar pendientes
    await supabaseAdmin.from("invitation").insert({
      company_id: companyId,
      email,
      role_id: roleId,
      invitation_url: invitationUrl,
      status: "pending",
      invited_by: invitedBy,
    } as any);

    return NextResponse.json({
      ok: true,
      authUserId,
      profileId,
      memberId,
      invitationUrl,
    });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
