// lib/supabaseBrowser.ts
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      cookies: {
        // @supabase/ssr se encarga de crear la cookie PKCE first-party.
        // No necesitamos implementar get/set aquí en cliente.
      },
    }
  );
}
