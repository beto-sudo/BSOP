import { supabaseAdmin } from "../db";

export async function listRoles(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("role")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createRole(companyId: string, payload: { name: string; description?: string }) {
  const { data, error } = await supabaseAdmin
    .from("role")
    .insert({
      company_id: companyId,
      name: payload.name,
      description: payload.description ?? "",
      is_system: false,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRole(roleId: string, payload: { name?: string; description?: string; is_active?: boolean }) {
  const patch: any = { updated_at: new Date().toISOString(), ...payload };
  const { data, error } = await supabaseAdmin.from("role").update(patch).eq("id", roleId).select("*").single();
  if (error) throw error;
  return data;
}

export async function assignRole(memberId: string, roleId: string) {
  const { data, error } = await supabaseAdmin
    .from("member_role")
    .insert({ company_member_id: memberId, role_id: roleId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function removeRole(memberId: string, roleId: string) {
  const { error } = await supabaseAdmin
    .from("member_role")
    .delete()
    .eq("company_member_id", memberId)
    .eq("role_id", roleId);
  if (error) throw error;
  return true;
}

export async function getRolePermissions(roleId: string) {
  const { data, error } = await supabaseAdmin
    .from("role_permission_view")
    .select("*")
    .eq("role_id", roleId);
  if (error) throw error;
  return data ?? [];
}

export async function setRolePermissions(roleId: string, list: Array<{ module_key: string; permission_key: string; allowed: boolean }>) {
  const { error: delErr } = await supabaseAdmin.from("role_permission").delete().eq("role_id", roleId);
  if (delErr) throw delErr;

  const { data: mods } = await supabaseAdmin.from("module").select("id,key");
  const { data: perms } = await supabaseAdmin.from("permission").select("id,key");
  const mMap = new Map((mods ?? []).map((m: any) => [m.key, m.id]));
  const pMap = new Map((perms ?? []).map((p: any) => [p.key, p.id]));

  const rows = list.map((x) => ({
    role_id: roleId,
    module_id: mMap.get(x.module_key),
    permission_id: pMap.get(x.permission_key),
    allowed: x.allowed,
  })).filter(r => r.module_id && r.permission_id);

  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin.from("role_permission").insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}
