// Cliente para el navegador (usa PKCE). No meter cookies aquí.
import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",           // <- importante para evitar #access_token
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
