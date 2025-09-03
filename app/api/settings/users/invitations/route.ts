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

    // 1) Crear/generar invitación en Auth para obtener authUserId + link
    let authUserId: string | undefined;
    let invitationUrl: string | undefined;

    const { data: linkData } = (await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    })) as any;

    if (linkData?.user?.id) authUserId = linkData.user.id;
    invitationUrl =
      linkData?.properties?.action_link || linkData?.action_link || null;

    if (!authUserId) {
      return bad("No se pudo crear usuario en Auth", 500);
    }

    // 2) Asegurar usuario interno en TU tabla "User" (usa UUID manual para respetar el FK)
    let internalUserId: string | undefined;

    // ¿Existe ya por email?
    {
      const { data: existing, error } = await supabaseAdmin
        .from("User")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.error("User select error:", error);
      } else if (existing?.id) {
        internalUserId = existing.id;
      }
    }

    // Si no existe, créalo con un UUID que también usaremos en company_member
    if (!internalUserId) {
      const newId = randomUUID();
      const { data, error } = await supabaseAdmin
        .from("User")
        .insert({
          id: newId,
          email,
          // descomenta si tu tabla tiene esta columna para enlazar con Auth
          // auth_id: authUserId,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("User insert error:", error);
        return bad("No se pudo crear usuario interno", 500);
      }
      internalUserId = data?.id || newId;
    }

    // 3) Crear membership en company_member (usa el id de TU tabla User)
    let memberId: string | undefined;
    {
      const { data, error } = await supabaseAdmin
        .from("company_member")
        .insert({
          company_id: companyId,
          user_id: internalUserId,
          is_active: true,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("company_member insert error:", error);
        return bad(
          `No se pudo registrar en company_member: ${error.message}`,
          500
        );
      }
      memberId = data?.id;
    }

    // 4) Rol inicial en member_role (tu tabla usa member_id + role_id)
    if (roleId && memberId) {
      const { error } = await supabaseAdmin.from("member_role").insert({
        member_id: memberId,
        role_id: roleId,
      });
      if (error) console.error("member_role insert error:", error);
    }

    // 5) Registrar invitación en tu tabla invitation (para listar pendientes)
    await supabaseAdmin.from("invitation").insert({
      company_id: companyId,
      email,
      role_id: roleId,
      invitation_url: invitationUrl,
      status: "pending",
      invited_by: invitedBy,
    });

    return NextResponse.json({
      ok: true,
      authUserId,
      internalUserId,
      memberId,
      invitationUrl,
    });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
