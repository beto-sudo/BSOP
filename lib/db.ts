// lib/db.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

function requireEnv(v: string | undefined, key: string) {
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

// Cliente admin (server-only). No persistimos sesión.
export const supabaseAdmin = createClient(
  requireEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

// ⚠️ Compatibilidad con código existente:
// Algunos handlers importan { dbOrThrow } desde "@/lib/db".
export function dbOrThrow() {
  // Si falta algún env, explota con mensaje claro.
  if (!SUPABASE_URL) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");
  return supabaseAdmin;
}

// Alias opcional por si en el futuro quieres usar un nombre más explícito.
export const getAdminClient = dbOrThrow;
