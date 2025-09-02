// lib/db.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/** Devuelve el cliente admin o lanza error si falta la service key */
export function dbOrThrow(): SupabaseClient {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY on server");
  return db;
}
