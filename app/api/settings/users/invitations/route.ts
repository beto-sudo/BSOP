// app/api/settings/users/invitations/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type Body = {
  companyId?: string;
  email?: string;
  roleId?: string | null;
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

    if (!companyId) return bad("companyId requerido", 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return bad("Email inválido", 400);
    }

    const redirectTo =
      (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "") + "/auth/callback" || undefined;

    let userId: string | undefined;
    let invitationUrl: string | undefined;
    let inviteErrText: string | undefined;

    // 1) Intentar enviar invitación por correo
    try {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (data?.user?.id) userId = data.user.id;
      if (error) inviteErrText = String(error.message || error);
    } catch (e: any) {
      inviteErrText = String(e?.message || e);
    }

    // 2) Generar link de invitación (no envía correo, pero te da el URL)
    if (!userId || !invitationUrl) {
      try {
        const { data: linkData } = (await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        })) as any;

        // Estructuras posibles según SDK:
        // linkData?.properties?.action_link  |  linkData?.action_link
        invitationUrl =
          linkData?.properties?.action_link ||
          linkData?.action_link ||
          invitationUrl;

        if (linkData?.user?.id && !userId) userId = linkData.user.id;
      } catch (_) {
        // silencio: seguiremos intentando
      }
    }

    // 3) Si aún no hay user, tratar de crearlo y volver a generar link
    if (!userId) {
      try {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: false, // no obliga confirmación inmediata
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
      } catch (_) {
        // si tampoco se puede, continuamos como "pendiente" sin link
      }
    }

    if (!userId) {
      // No logramos conseguir userId de ninguna forma
      const msg = inviteErrText
        ? `No se pudo preparar la invitación (Auth): ${inviteErrText}`
        : "No se pudo preparar la invitación (Auth).";
      return bad(msg, 500);
    }

    // 4) Asegurar miembro en la empresa
    {
      const { error: upsertMemberErr } = await supabaseAdmin
        .from("company_members")
        .upsert(
          {
            company_id: companyId,
            user_id: userId!,
            is_active: true,
          },
          { onConflict: "company_id,user_id" }
        );
      if (upsertMemberErr) {
        console.error("upsert company_members error:", upsertMemberErr);
        return bad("No se pudo registrar el miembro en la empresa.", 500);
      }
    }

    // 5) Rol inicial (opcional)
    if (roleId) {
      const { error: roleErr } = await supabaseAdmin
        .from("company_role_members")
        .upsert(
          {
            company_id: companyId,
            role_id: roleId,
            user_id: userId!,
          },
          { onConflict: "company_id,role_id,user_id" }
        );
      if (roleErr) {
        console.error("upsert company_role_members error:", roleErr);
        return NextResponse.json(
          {
            ok: true,
            userId,
            invitationUrl,
            warning: "Miembro creado pero no se pudo asignar el rol",
          },
          { status: 207 }
        );
      }
    }

    // 6) Respuesta final: si no se pudo mandar email, devolvemos el link (si existe)
    const payload: any = { ok: true, userId };
    if (invitationUrl) payload.invitationUrl = invitationUrl;
    if (inviteErrText) payload.warning = "No se envió email; usa el link manualmente.";

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
