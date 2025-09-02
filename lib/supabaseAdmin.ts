// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente ADMIN (service role). Solo se usa en servidor.
 * Bypass de RLS. ¡Nunca expongas esta clave al cliente!
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!serviceKey) return null; // lo detectaremos en el endpoint
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
