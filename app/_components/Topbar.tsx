// app/_components/Topbar.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import CompanyParamGuard from "./CompanyParamGuard";

type UserInfo = {
  email: string | null;
  fullName?: string | null;
  avatar_url?: string | null;
};

function useAuthUser(): UserInfo | null {
  const [user, setUser] = useState<UserInfo | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supa = supabaseBrowser();
        const { data } = await supa.auth.getUser();
        if (!alive) return;
        setUser({
          email: data.user?.email ?? null,
          fullName: data.user?.user_metadata?.full_name ?? null,
          avatar_url: data.user?.user_metadata?.avatar_url ?? null,
        });
      } catch {
        if (alive) setUser(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return user;
}

export default function Topbar() {
  const user = useAuthUser();
  const pathname = usePathname();
  const router = useRouter();
  const qp = useSearchParams();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // company label
  const slug = (qp.get("company") || "").toLowerCase();
  const [companyLabel, setCompanyLabel] = useState<string>(slug ? slug.toUpperCase() : "—");
  useEffect(() => {
    if (!slug) {
      setCompanyLabel("—");
      return;
    }
    let alive = true;
    fetch(`/api/admin/company?company=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        // Priorizar razón social (legalName), luego nombre comercial
        setCompanyLabel(j?.legalName || j?.name || slug.toUpperCase());
      })
      .catch(() => {
        if (alive) setCompanyLabel(slug.toUpperCase());
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Flag de superadmin
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-superadmin")
      .then((r) => (r.ok ? r.json() : { is: false }))
      .then((j) => alive && setIsSuperadmin(!!j.is))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    detailsRef.current?.removeAttribute("open");
  }, [pathname, slug]);

  async function signOut() {
    try {
      await supabaseBrowser().auth.signOut();
    } catch {}
    router.push("/signin");
  }
  function goToAdmin() {
    detailsRef.current?.removeAttribute("open");
    router.push("/settings/admin");
  }

  return (
    <>
      {/* Guard global para evitar rebotes de company en rutas exentas */}
      <CompanyParamGuard />

      <header className="sticky top-0 z-30 h-14 bg-white/80 backdrop-blur border-b">
        {/* pegado al sidebar */}
        <div className="h-full w-full px-3 sm:px-4 flex items-center justify-between gap-3">
          {/* IZQUIERDA: razón social */}
          <div className="min-w-0">
            <div className="text-xs text-slate-500 leading-none">
              {slug ? slug.toUpperCase() : ""}
            </div>
            <div className="text-sm font-semibold truncate">{companyLabel}</div>
          </div>

          {/* DERECHA: usuario */}
          <div className="ml-auto">
            <details ref={detailsRef} className="relative">
              <summary className="list-none select-none cursor-pointer rounded-md border px-2 py-1 text-sm bg-white hover:bg-slate-50">
                {user?.fullName || user?.email || "Cuenta"}
              </summary>
              <div className="absolute right-0 mt-1 w-56 rounded-lg border bg-white shadow-md">
                <nav className="p-1">
                  <Link
                    href="/settings/profile"
                    className="block px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
                    onClick={() => detailsRef.current?.removeAttribute("open")}
                  >
                    Perfil y ajustes
                  </Link>

                  {isSuperadmin && (
                    <button
                      onClick={goToAdmin}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
                    >
                      Panel de superadmin
                    </button>
                  )}

                  <button
                    onClick={signOut}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
                  >
                    Cerrar sesión
                  </button>
                </nav>
              </div>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
