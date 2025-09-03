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

    // ------------------------------------------------------------
    // 1) Crear/generar invitación en Auth → authUserId + link
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // 2) Asegurar usuario interno en TU tabla "User"
    //    - primero buscamos por email
    //    - si no existe, intentamos insertar SIN id (si tu tabla tiene default)
    //    - si falla, insertamos CON id (randomUUID)
    //    - guardamos auth_id
    // ------------------------------------------------------------
    let internalUserId: string | undefined;

    // a) buscar
    {
      const { data, error } = await supabaseAdmin
        .from("User")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!error && data?.id) internalUserId = data.id;
    }

    // b) insertar sin id (si tu columna id tiene default uuid)
    if (!internalUserId) {
      const { data, error } = await supabaseAdmin
        .from("User")
        .insert({
          email,
          auth_id: authUserId, // si no existe la columna no pasa nada (solo ignora)
        } as any)
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        internalUserId = data.id;
      }
    }

    // c) insertar con id manual (si lo anterior no funcionó)
    if (!internalUserId) {
      const newId = randomUUID();
      const { data, error } = await supabaseAdmin
        .from("User")
        .insert({
          id: newId,
          email,
          auth_id: authUserId,
        } as any)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("User insert error:", error);
        return bad("No se pudo crear usuario interno", 500);
      }
      internalUserId = data?.id || newId;
    }

    // d) aseguramos que auth_id esté seteado aunque ya existiera el User
    await supabaseAdmin
      .from("User")
      .update({ auth_id: authUserId } as any)
      .eq("id", internalUserId);

    // ------------------------------------------------------------
    // 3) company_member (usa User.id interno)
    // ------------------------------------------------------------
    const { data: cm, error: cmErr } = await supabaseAdmin
      .from("company_member")
      .insert({
        company_id: companyId,
        user_id: internalUserId,
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

    // ------------------------------------------------------------
    // 4) member_role (tu tabla usa member_id + role_id)
    // ------------------------------------------------------------
    if (roleId && memberId) {
      const { error } = await supabaseAdmin
        .from("member_role")
        .insert({ member_id: memberId, role_id: roleId } as any);
      if (error) console.error("member_role insert error:", error);
    }

    // ------------------------------------------------------------
    // 5) invitation (para listar pendientes)
    // ------------------------------------------------------------
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
      internalUserId,
      memberId,
      invitationUrl,
    });
  } catch (e: any) {
    console.error("POST /settings/users/invitations", e);
    return bad("Error inesperado en invitación", 500);
  }
}
