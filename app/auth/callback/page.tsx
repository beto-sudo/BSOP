"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
  const [msg, setMsg] = useState("Procesando inicio de sesión…");
  const [details, setDetails] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = supabaseBrowser();

        const code = params.get("code");
        const redirect = params.get("redirect") || "/";

        if (!code) {
          setMsg("No se pudo completar el inicio de sesión. Intenta de nuevo.");
          setDetails("La URL no contiene ?code=. Revisa URL Configuration en Supabase y NEXT_PUBLIC_APP_URL.");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        router.replace(redirect);
      } catch (e: any) {
        console.error(e);
        setMsg("No se pudo completar el inicio de sesión. Intenta de nuevo.");
        setDetails(e?.message ?? String(e));
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto my-24 max-w-md text-center space-y-2">
      <p className="text-sm text-neutral-700">{msg}</p>
      {details ? (
        <pre className="mt-4 rounded bg-neutral-100 p-3 text-left text-xs text-neutral-700 overflow-auto">
{details}
        </pre>
      ) : null}
    </div>
  );
}
