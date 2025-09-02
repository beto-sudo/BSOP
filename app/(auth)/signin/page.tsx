// app/(auth)/signin/page.tsx
"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignIn() {
  const redirect = useSearchParams().get("redirect") || "/";
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

  async function signInWithGoogle() {
    setErr(null);
    setLoading(true);
    const supabase = supabaseBrowser();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        flowType: "pkce", // <- MUY importante (evita #access_token)
        redirectTo: `${APP_URL}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) { setErr(error.message); setLoading(false); return; }
    const url = data?.url;
    if (!url) { setErr("No se obtuvo la URL de OAuth."); setLoading(false); return; }

    try {
      if (window.top && window.top !== window) window.top.location.href = url;
      else window.location.href = url;
    } catch { window.open(url, "_blank", "noopener"); }
  }

  return (
    <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Inicia sesión</h1>
      <button onClick={signInWithGoogle} disabled={loading} className="w-full rounded-xl border px-4 py-2 text-sm">
        {loading ? "Conectando..." : "Continuar con Google"}
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
