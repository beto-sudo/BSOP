import { supabaseAdmin } from "../db";

export async function setOverrides(memberId: string, entries: Array<{ module_key: string; permission_key: string; allowed: boolean }>) {
  const { error: delErr } = await supabaseAdmin.from("member_permission_override").delete().eq("company_member_id", memberId);
  if (delErr) throw delErr;

  const { data: mods } = await supabaseAdmin.from("module").select("id,key");
  const { data: perms } = await supabaseAdmin.from("permission").select("id,key");
  const mMap = new Map((mods ?? []).map((m: any) => [m.key, m.id]));
  const pMap = new Map((perms ?? []).map((p: any) => [p.key, p.id]));

  const rows = entries.map((e) => ({
    company_member_id: memberId,
    module_id: mMap.get(e.module_key),
    permission_id: pMap.get(e.permission_key),
    allowed: e.allowed,
  })).filter(r => r.module_id && r.permission_id);

  if (!rows.length) return [];

  const { data, error } = await supabaseAdmin.from("member_permission_override").insert(rows).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function clearOverrides(memberId: string) {
  const { error } = await supabaseAdmin.from("member_permission_override").delete().eq("company_member_id", memberId);
  if (error) throw error;
  return true;
}
