"use client";
import { createClient } from "@supabase/supabase-js";
// Si prefieres, puedes usar: import { createBrowserClient as createClient } from "@supabase/ssr";

export const supabaseBrowser = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
