// lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente ADMIN con service role (solo en servidor).
 * Bypass de RLS, pero úsalo detrás de comprobación de sesión.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // <-- agrega esta env var en Vercel
  { auth: { persistSession: false, autoRefreshToken: false } }
);
