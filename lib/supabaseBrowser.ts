import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",            // <- IMPORTANTÍSIMO
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // storageKey fijo (opcional, ayuda a evitar claves raras)
        storageKey: "bsop-auth",
      },
    }
  );
