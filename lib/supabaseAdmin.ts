// lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente ADMIN (service role). Solo en servidor.
 * - `supabaseAdmin`: cliente ya construido (puede ser null si falta la env var).
 * - `getSupabaseAdmin()`: devuelve el cliente (o null) perezosamente.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _client: SupabaseClient | null = null;

function build(): SupabaseClient | null {
  if (!serviceKey) return null;
  if (_client) return _client;
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  return build();
}

// Compatibilidad con imports existentes: { supabaseAdmin } from "@/lib/supabaseAdmin"
export const supabaseAdmin: SupabaseClient | null = build();
