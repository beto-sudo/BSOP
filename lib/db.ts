// lib/db.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export function dbOrThrow(): SupabaseClient<any, any, any> {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY on server");
  return db;
}
