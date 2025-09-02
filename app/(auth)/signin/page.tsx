"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignInPage() {
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/";
  const [loading, setLoading] = useState(false);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const signIn = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(
            redirect
          )}`,
          queryParams: { prompt: "select_account" },
          skipBrowserRedirect: false,
        },
      });
    } finally {
      setLoading(false);
    }
  }, [redirect, appUrl]);

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="rounded-xl border p-6 shadow">
        <h1 className="mb-4 text-xl font-semibold">Inicia sesión</h1>
        <button
          onClick={signIn}
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Redirigiendo…" : "Continuar con Google"}
        </button>
      </div>
    </div>
  );
}
