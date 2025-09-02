"use client";

import { useCallback, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignInPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogle = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = supabaseBrowser();

     const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");


      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "/";

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // flowType ya quedó en el cliente (supabaseBrowser)
          redirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(
            redirect
          )}`,
          queryParams: { prompt: "select_account" },
          skipBrowserRedirect: false,
        },
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mx-auto my-16 max-w-xl rounded-2xl border p-6">
      <h1 className="mb-6 text-2xl font-semibold">Inicia sesión</h1>
      <button
        onClick={handleGoogle}
        className="w-full rounded-lg bg-neutral-900 px-4 py-3 font-medium text-white hover:bg-neutral-800"
        disabled={loading}
      >
        {loading ? "Abriendo Google…" : "Continuar con Google"}
      </button>
    </div>
  );
}
