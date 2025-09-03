import { supabaseAdmin } from "../db";
import { z } from "zod";

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin.from("profile").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId: string, patch: any) {
  const allowed = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone: z.string().optional(),
    avatar_url: z.string().optional(),
    locale: z.string().optional(),
    is_active: z.boolean().optional(),
  });
  const data = allowed.parse(patch);
  const { data: updated, error } = await supabaseAdmin
    .from("profile")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return updated;
}
