"use client";

import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // guardamos sesión en el navegador
        persistSession: true,
        autoRefreshToken: true,
        // NO intentes leer tokens de la URL automáticamente (usaremos PKCE)
        detectSessionInUrl: false,
      },
    }
  );
