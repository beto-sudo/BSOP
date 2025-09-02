// lib/supabaseBrowser.ts
"use client";
import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // esto solo gestiona el flujo implícito (#access_token). Con PKCE no hace falta.
        detectSessionInUrl: false,
      },
    }
  );
