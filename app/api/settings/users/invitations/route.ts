// app/api/settings/users/invitations/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

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

    // ------------------------------------------------------------------
    // 1) Preparar AUTH: invite/generateLink/createUser (para que pueda entrar)
    // ------------------------------------------------------------------
    let authUserId: string | undefined;
    let invitationUrl: string | undefined;
    let inviteErrText: string | undefined;

    try {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo }
      );
      if (data?.user?.id) authUserId = data.user.id;
      if (error) inviteErrText = String(error.message || error);
    } catch (e: any) {
      inviteErrText = String(e?.message || e);
    }

    if (!authUserId || !invitationUrl) {
      try {
        const { data: linkData } = (await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        })) as any;
        invitationUrl =
          linkData?.properties?.action_link || linkData?.action_link || invitationUrl;
        if (linkData?.user?.id && !authUserId) authUserId = linkData.user.id;
      } catch {}
    }

    if (!authUserId) {
      try {
        const { data: created } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: false,
        });
        if (created?.user?.id) authUserId = created.user.id;

        if (!invitationUrl) {
          const { data: l2 } = (await supabaseAdmin.auth.admin.generateLink({
            type: "invite",
            email,
            options: { redirectTo },
          })) as any;
          invitationUrl =
            l2?.properties?.action_link || l2?.action_link || invitationUrl;
        }
      } catch {}
    }

    if (!authUserId) {
      const msg = inviteErrText
        ? `No se pudo preparar la invitación (Auth): ${inviteErrText}`
        : "No se pudo preparar la invitación (Auth).";
      return bad(msg, 500);
    }

    // ------------------------------------------------------------------
    // 2) USUARIO INTERNO (TU TABLA "User"): crear/obtener por email
    //    company_member.user_id apunta a User.id (no a auth.users.id)
    // ------------------------------------------------------------------
    let internalUserId: string | undefined;

    // ¿Existe ya?
    {
      const { data, error } = await supabaseAdmin
        .from("User")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.error("User select error:", error);
      } else if (data?.id) {
        internalUserId = data.id;
      }
    }

    // Si no existe, créalo minimalmente
    if (!internalUserId) {
      const { data, error } = await supabaseAdmin
        .from("User")
        .insert({ email })
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("User insert error:", error);
        // No bloqueamos: seguimos con invitación registrada y aviso
      } else if (data?.id) {
        internalUserId = data.id;
      }
    }

    // ------------------------------------------------------------------
    // 3) COMPANY_MEMBER: usar (company_id, user_id) con el User.id interno
    // ------------------------------------------------------------------
    let memberId: string | undefined; // por si tu member_role usa member_id
    let memberUpsertError: string | undefined;

    if (internalUserId) {
      const { data, error } = await supabaseAdmin
        .from("company_member")
        .upsert(
          { company_id: companyId, user_id: internalUserId, is_active: true },
          { onConflict: "company_id,user_id" }
        )
        .select("id")
        .maybeSingle();

      if (error) {
        memberUpsertError = String(error.message || error);
        console.error("upsert company_member error:", error);
      } else if (data?.id) {
        memberId = data.id;
      } else {
        // Si el upsert no regresó fila, intenta obtenerla
        const { data: cm } = await supabaseAdmin
          .from("company_member")
          .select("id")
          .eq("company_id", companyId)
          .eq("user_id", internalUserId)
          .maybeSingle();
        if (cm?.id) memberId = cm.id;
      }
    } else {
      memberUpsertError = "No se pudo obtener/crear el usuario interno (tabla User).";
    }

    // ------------------------------------------------------------------
    // 4) ROLE INICIAL: intenta (company_id, user_id, role_id);
    //    si tu tabla NO tiene company_id, usa (member_id, role_id).
    // ------------------------------------------------------------------
    let roleUpsertError: string | undefined;

    if (roleId) {
      let roleDone = false;

      // Intento A: esquema (company_id, user_id, role_id)
      if (internalUserId) {
        const { error } = await supabaseAdmin
          .from("member_role")
          .upsert(
            { company_id: companyId, user_id: internalUserId, role_id: roleId },
            { onConflict: "company_id,user_id,role_id" }
          );

        if (!error) {
          roleDone = true;
        } else {
          // Si el error fue "no existe column company_id", intentamos la vía B
          if (String(error.message || error).includes("company_id")) {
            // continuará con el plan B
          } else {
            roleUpsertError = String(error.message || error);
          }
        }
      }

      // Intento B: esquema (member_id, role_id)
      if (!roleDone && memberId) {
        const { error } = await supabaseAdmin
          .from("member_role")
          .upsert(
            { member_id: memberId, role_id: roleId },
            { onConflict: "member_id,role_id" }
          );
        if (error) {
          roleUpsertError = String(error.message || error);
        } else {
          roleDone = true;
        }
      }
    }

    // ------------------------------------------------------------------
    // 5) Registrar invitación en tu tabla "invitation"
    // ------------------------------------------------------------------
    {
      const { error } = await supabaseAdmin
        .from("invitation")
        .insert({
          company_id: companyId,
          email,
          role_id: roleId,
          invitation_url: invitationUrl || null,
          status: "pending",
          invited_by: invitedBy || null,
        });
      if (error) console.error("insert invitation error:", error);
    }

    // ------------------------------------------------------------------
    // 6) Respuesta — no bloqueamos si falla membership/role; avisamos
    // ------------------------------------------------------------------
    const payload: any = { ok: true, authUserId, invitationUrl };
    if (inviteErrText) payload.warning = "No se envió email; usa el link manualmente.";
    if (memberUpsertError) payload.memberWarning = `No se registró en company_member: ${memberUpsertError}`;
    if (roleUpsertError) payload.roleWarning = `No se asignó rol: ${roleUpsertError}`;
    return NextResponse.json(payload, { status: memberUpsertError || roleUpsertError ? 207 : 200 });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
