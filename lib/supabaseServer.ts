// NO uses cookies() aquí. Este módulo solo exporta un factory.
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieFns = {
  get: (name: string) => string | undefined;
  set: (name: string, value: string, options: CookieOptions) => void;
  remove: (name: string, options: CookieOptions) => void;
};

export function createSupabaseServer(cookieFns: CookieFns) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieFns }
  );
}
