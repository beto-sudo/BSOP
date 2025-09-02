// app/(auth)/signin/page.tsx
"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!; // ej. https://bsop.vercel.app

export default function SignInPage() {
  const params = useSearchParams();
  const redirect = useMemo(() => params.get("redirect") ?? "/", [params]);
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    const supabase = supabaseBrowser();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        flowType: "pkce",
        redirectTo: `${APP_URL}?redirect=${encodeURIComponent(redirect)}`,
        queryParams: { prompt: "select_account" },
      } as any,
    });

    if (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border p-8 shadow-sm bg-white">
        <h1 className="mb-6 text-xl font-semibold">Inicia sesión</h1>
        <button
          onClick={onClick}
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Redirigiendo…" : "Continuar con Google"}
        </button>
      </div>
    </div>
  );
}
