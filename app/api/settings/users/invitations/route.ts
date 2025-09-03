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

    let userId: string | undefined;

    // 1) Intentar INVITE oficial
    {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo:
          process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") + "/auth/callback" ||
          undefined,
      });

      if (data?.user?.id) userId = data.user.id;

      // fallback: generateLink
      if (!userId) {
        const { data: linkData, error: linkErr } = (await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            redirectTo:
              process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") + "/auth/callback" ||
              undefined,
          },
        })) as any; // 👈 aquí forzamos any para evitar TS "never"

        if (linkErr && !(linkData?.user?.id)) {
          console.error("generateLink error:", linkErr);
        }
        if (linkData?.user?.id) userId = linkData.user.id;
      }

      if (!userId && error) {
        console.error("inviteUserByEmail error:", error);
        return bad("No se pudo enviar la invitación (Auth).", 500);
      }
    }

    // 2) company_members
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

    // 3) company_role_members (opcional)
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
          { ok: true, userId, warning: "Miembro creado pero no se pudo asignar el rol" },
          { status: 207 }
        );
      }
    }

    return NextResponse.json({ ok: true, userId }, { status: 200 });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
