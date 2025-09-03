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

    let userId: string | undefined;
    let invitationUrl: string | undefined;
    let inviteErrText: string | undefined;

    // 1) Invitar por correo (si hay SMTP)
    try {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        { redirectTo }
      );
      if (data?.user?.id) userId = data.user.id;
      if (error) inviteErrText = String(error.message || error);
    } catch (e: any) {
      inviteErrText = String(e?.message || e);
    }

    // 2) Generar link (funciona sin SMTP)
    if (!userId || !invitationUrl) {
      try {
        const { data: linkData } = (await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        })) as any;

        invitationUrl =
          linkData?.properties?.action_link ||
          linkData?.action_link ||
          invitationUrl;

        if (linkData?.user?.id && !userId) userId = linkData.user.id;
      } catch {}
    }

    // 3) Crear usuario si todavía no existe
    if (!userId) {
      try {
        const { data: created } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: false,
          });
        if (created?.user?.id) userId = created.user.id;

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

    if (!userId) {
      const msg = inviteErrText
        ? `No se pudo preparar la invitación (Auth): ${inviteErrText}`
        : "No se pudo preparar la invitación (Auth).";
      return bad(msg, 500);
    }

    // 4) Intentar registrar en TU tabla 'company_member'
    let memberUpsertError: any = null;
    {
      const { error } = await supabaseAdmin
        .from("company_member")
        .upsert(
          // ⚠️ SOLO los mínimos conocidos; si tu tabla exige más campos,
          // esta operación fallará y te devolvemos el detalle en la respuesta.
          { company_id: companyId, user_id: userId, is_active: true },
          { onConflict: "company_id,user_id" }
        );
      if (error) {
        memberUpsertError = String(error.message || error);
        console.error("upsert company_member error:", error);
      }
    }

    // 5) Asignar rol inicial en 'member_role' (opcional)
    let roleUpsertError: any = null;
    if (roleId) {
      const { error } = await supabaseAdmin
        .from("member_role")
        .upsert(
          { company_id: companyId, user_id: userId, role_id: roleId },
          { onConflict: "company_id,user_id,role_id" }
        );
      if (error) {
        roleUpsertError = String(error.message || error);
        console.error("upsert member_role error:", error);
      }
    }

    // 6) Registrar invitación (siempre)
    {
      const { error } = await supabaseAdmin
        .from("invitation")
        .insert({
          company_id: companyId,
          email,
          role_id: roleId,
          invitation_url: invitationUrl || null,
          status: "pending",
          invited_by: invitedBy,
        });
      if (error) console.error("insert invitation error:", error);
    }

    // 7) Respuesta – no bloqueamos por el fallo del member:
    const payload: any = { ok: true, userId, invitationUrl };
    if (inviteErrText) payload.warning = "No se envió email; usa el link manualmente.";
    if (memberUpsertError) payload.memberWarning = `No se registró en company_member: ${memberUpsertError}`;
    if (roleUpsertError) payload.roleWarning = `No se asignó rol: ${roleUpsertError}`;

    // Si falló el member, regresamos 207 (Multi-Status) para que la UI avise
    const status = memberUpsertError || roleUpsertError ? 207 : 200;
    return NextResponse.json(payload, { status });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
