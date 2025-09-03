import { supabaseAdmin } from "../db";

export async function listModules() {
  const { data, error } = await supabaseAdmin.from("module").select("*").eq("is_active", true).order("order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listPermissions() {
  const { data, error } = await supabaseAdmin.from("permission").select("*");
  if (error) throw error;
  return data ?? [];
}
