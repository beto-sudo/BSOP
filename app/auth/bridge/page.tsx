// app/auth/bridge/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthBridge() {
  const qp = useSearchParams();

  useEffect(() => {
    (async () => {
      const redirect = qp.get("redirect") || "/";

      // 1) Intercambia ?code=... -> sesión cliente (PKCE)
      const supabase = supabaseBrowser();
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      );
      if (exErr) {
        console.error("exchangeCodeForSession:", exErr);
        window.location.assign(`/signin?redirect=${encodeURIComponent(redirect)}&err=oauth`);
        return;
      }

      // 2) Obtiene tokens del cliente
      const { data } = await supabase.auth.getSession();
      const access_token = data.session?.access_token;
      const refresh_token = data.session?.refresh_token;

      if (!access_token || !refresh_token) {
        window.location.assign(`/signin?redirect=${encodeURIComponent(redirect)}&err=no_tokens`);
        return;
      }

      // 3) Envia tokens al server para setear cookies httpOnly
      const r = await fetch("/api/auth/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token }),
        credentials: "include",
      });

      if (!r.ok) {
        console.error("api/auth/set failed:", await r.text());
        window.location.assign(`/signin?redirect=${encodeURIComponent(redirect)}&err=set_session`);
        return;
      }

      // 4) Limpia params visibles y navega duro al destino
      const cleanUrl = window.location.origin + "/"; // evita dejar /auth/bridge en el historial
      window.history.replaceState({}, "", cleanUrl);
      window.location.assign(redirect);
    })();
  }, [qp]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border p-6 shadow-sm bg-white text-sm">
        Estableciendo sesión…
      </div>
    </div>
  );
}
