import { supabaseAdmin } from "../db";
import crypto from "crypto";

export async function createInvite(companyId: string, email: string, roleIds: string[], invitedBy: string, expiresAt: string) {
  const token = crypto.randomBytes(18).toString("hex");
  const { data, error } = await supabaseAdmin
    .from("invitation")
    .insert({
      company_id: companyId,
      email: email.toLowerCase(),
      role_ids: roleIds,
      invited_by: invitedBy,
      token,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function acceptInvite(token: string, userId: string) {
  const { data: inv, error: invErr } = await supabaseAdmin.from("invitation").select("*").eq("token", token).single();
  if (invErr) throw invErr;
  if (!inv) throw new Error("Invitation not found");
  if (inv.status !== "pending") throw new Error("Invitation not pending");
  if (new Date(inv.expires_at) < new Date()) throw new Error("Invitation expired");

  const { data: prof } = await supabaseAdmin.from("profile").select("*").eq("id", userId).single();
  if (!prof) {
    const { error: profErr } = await supabaseAdmin.from("profile").insert({ id: userId, email: inv.email });
    if (profErr) throw profErr;
  }

  const { data: existing } = await supabaseAdmin
    .from("company_member")
    .select("id")
    .eq("company_id", inv.company_id)
    .eq("user_id", userId)
    .maybeSingle();

  let memberId = existing?.id;
  if (!memberId) {
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("company_member")
      .insert({ company_id: inv.company_id, user_id: userId, is_active: true })
      .select("id")
      .single();
    if (memErr) throw memErr;
    memberId = mem.id;
  }

  const roleIds: string[] = inv.role_ids || [];
  for (const rid of roleIds) {
    await supabaseAdmin.from("member_role").insert({ company_member_id: memberId, role_id: rid }).select("*");
  }

  const { error: updErr } = await supabaseAdmin.from("invitation").update({ status: "accepted" }).eq("id", inv.id);
  if (updErr) throw updErr;

  return { member_id: memberId, company_id: inv.company_id };
}
