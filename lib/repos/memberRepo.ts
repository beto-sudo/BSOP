import { supabaseAdmin } from "../db";

export async function searchMembers(companyId: string, q: string | null, limit = 20, offset = 0) {
  let query = supabaseAdmin
    .from("company_member_view")
    .select("*", { count: "exact" })
    .eq("company_id", companyId);

  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }

  query = query.order("full_name", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export async function getMemberByUser(companyId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("company_member_view")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function setMemberActive(memberId: string, isActive: boolean) {
  const { data, error } = await supabaseAdmin
    .from("company_member")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
