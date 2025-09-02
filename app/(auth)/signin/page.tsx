"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignIn() {
  const redirect = useSearchParams().get("redirect") || "/";
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signInWithGoogle() {
    setErr(null);
    setLoading(true);
    const supabase = supabaseBrowser();
    const appOrigin = window.location.origin;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Cast para que el compilador de Vercel no se queje del 'flowType'
      options: {
        flowType: "pkce",
        redirectTo: `${appOrigin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      } as any,
    });

    if (error) { setErr(error.message); setLoading(false); return; }
    if (data?.url) window.location.href = data.url;
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
