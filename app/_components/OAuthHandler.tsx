// app/_components/OAuthHandler.tsx
"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function OAuthHandler() {
  const params = useSearchParams();
  const ranRef = useRef(false);

  useEffect(() => {
    // evita doble ejecución en renders consecutivos
    if (ranRef.current) return;
    ranRef.current = true;

    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return;

    (async () => {
      const redirect = params.get("redirect") || "/";

      if (error) {
        console.error("OAuth error:", params.get("error_description") || error);
        // limpia la URL (quita code/error) y lleva al destino
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
        window.location.assign(redirect);
        return;
      }

      try {
        const supabase = supabaseBrowser();
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (exErr) {
          console.error("exchangeCodeForSession", exErr);
        }
      } finally {
        // 1) limpiamos la URL para quitar ?code=...
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
        // 2) navegación DURA para que el middleware reciba cookies frescas
        window.location.assign(redirect);
      }
    })();
  }, [params]);

  return null;
}
