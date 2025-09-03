import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

function requireEnv(v: string | undefined, key: string) {
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

export const supabaseAdmin = createClient(
  requireEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);
