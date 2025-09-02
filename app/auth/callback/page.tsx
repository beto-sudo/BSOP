"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
  const [msg, setMsg] = useState("Procesando inicio de sesión…");
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = supabaseBrowser();

        // Intercambia ?code=... por sesión y setea cookies en el navegador
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (error) throw error;

        const redirect = params.get("redirect") || "/";
        router.replace(redirect);
      } catch (e) {
        console.error(e);
        setMsg("No se pudo completar el inicio de sesión. Intenta de nuevo.");
      }
    };
    run();
  }, [router, params]);

  return (
    <div className="mx-auto my-24 max-w-md text-center">
      <p className="text-sm text-neutral-600">{msg}</p>
    </div>
  );
}
