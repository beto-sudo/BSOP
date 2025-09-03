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

    // 1) Intentar INVITE oficial (envía email)
    let userId: string | undefined;
    {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        // si tienes una URL pública, úsala para que el botón del correo regrese a tu app
        redirectTo:
          process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") +
            "/auth/callback" ||
          undefined,
      });

      if (data?.user?.id) userId = data.user.id;

      // Si el usuario ya existe, inviteUserByEmail puede fallar:
      // en ese caso generamos el link solo para recuperar el user.id
      if (!userId) {
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            redirectTo:
              process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") +
                "/auth/callback" ||
              undefined,
          },
        });
        if (linkErr && !linkData?.user?.id) {
          console.error("generateLink error:", linkErr);
        }
        if (linkData?.user?.id) userId = linkData.user.id;
      }

      if (!userId && error) {
        // No logramos obtener userId por ningún camino
        console.error("inviteUserByEmail error:", error);
        return bad("No se pudo enviar la invitación (Auth).", 500);
      }
    }

    // 2) Asegurar que exista el member en la compañía
    //    Tablas asumidas del módulo: company_members y company_role_members
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

    // 3) Rol inicial (opcional)
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
        // Nota: no abortamos por esto; la invitación ya se envió.
        // Pero sí regresamos 207 con mensaje.
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
