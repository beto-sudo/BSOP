import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,          // viene de tu .env
  process.env.SUPABASE_SERVICE_ROLE!, // viene de tu .env (server-only)
  { auth: { persistSession: false } }
);
