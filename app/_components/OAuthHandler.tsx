// app/_components/OAuthHandler.tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function OAuthHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return;

    (async () => {
      if (error) {
        console.error("OAuth error:", params.get("error_description") || error);
        router.replace(params.get("redirect") || "/");
        return;
      }

      const supabase = supabaseBrowser();
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (exErr) {
        console.error("exchangeCodeForSession", exErr);
      }

      const redirect = params.get("redirect") || "/";
      router.replace(redirect);
    })();
  }, [params, router]);

  return null;
}
