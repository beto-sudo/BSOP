import { supabaseAdmin } from "../db";
import type { PermissionKey, ModuleKey } from "../types";

export async function getEffectivePermissions(memberId: string) {
  const { data: overrides, error: ovErr } = await supabaseAdmin
    .from("member_permission_override")
    .select("module_id, permission_id, allowed")
    .eq("company_member_id", memberId);
  if (ovErr) throw ovErr;

  const { data: roles, error: rolesErr } = await supabaseAdmin
    .from("member_role")
    .select("role_id")
    .eq("company_member_id", memberId);
  if (rolesErr) throw rolesErr;

  const roleIds = (roles ?? []).map((r) => r.role_id);
  let rolePerms: any[] = [];
  if (roleIds.length) {
    const { data: rp, error: rpErr } = await supabaseAdmin
      .from("role_permission")
      .select("module_id, permission_id, allowed")
      .in("role_id", roleIds);
    if (rpErr) throw rpErr;
    rolePerms = rp ?? [];
  }

  const { data: modules } = await supabaseAdmin.from("module").select("id, key");
  const { data: perms } = await supabaseAdmin.from("permission").select("id, key");
  const mMap = new Map<string, ModuleKey>((modules ?? []).map((m: any) => [m.id, m.key]));
  const pMap = new Map<string, PermissionKey>((perms ?? []).map((p: any) => [p.id, p.key]));

  const base: Record<string, Record<string, boolean>> = {};
  for (const rp of rolePerms) {
    const mk = mMap.get(rp.module_id);
    const pk = pMap.get(rp.permission_id);
    if (!mk || !pk) continue;
    base[mk] ??= {};
    if (rp.allowed) base[mk][pk] = true;
  }

  for (const ov of overrides ?? []) {
    const mk = mMap.get(ov.module_id);
    const pk = pMap.get(ov.permission_id);
    if (!mk || !pk) continue;
    base[mk] ??= {};
    base[mk][pk] = !!ov.allowed;
  }

  return base;
}
