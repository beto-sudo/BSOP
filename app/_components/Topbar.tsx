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

function initialsFrom(nameOrEmail?: string | null) {
  if (!nameOrEmail) return "U";
  const name = nameOrEmail.split("@")[0];
  const parts = name.trim().split(/\s+/);
  const ini = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
  return ini || "U";
}

function useAuthUser(): UserInfo | null {
  const [user, setUser] = useState<UserInfo | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supa = supabaseBrowser();
        const { data } = await supa.auth.getUser();
        if (!alive) return;
        const meta = (data.user?.user_metadata as any) || {};
        const pic = meta.avatar_url || meta.picture || null;
        setUser({
          email: data.user?.email ?? null,
          fullName: meta.full_name || meta.name || data.user?.email || null,
          avatar_url: pic,
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
        // Prioriza razón social
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

  const displayName = user?.fullName || user?.email || "Cuenta";
  const avatar = user?.avatar_url;

  return (
    <>
      {/* Guard global para evitar rebotes de company en rutas exentas */}
      <CompanyParamGuard />

      <header className="sticky top-0 z-30 h-14 bg-white/80 backdrop-blur border-b">
        <div className="h-full w-full px-3 sm:px-4 flex items-center justify-between gap-3">
          {/* IZQUIERDA: razón social */}
          <div className="min-w-0">
            <div className="text-xs text-slate-500 leading-none">{slug ? slug.toUpperCase() : ""}</div>
            <div className="text-sm font-semibold truncate">{companyLabel}</div>
          </div>

          {/* DERECHA: usuario */}
          <div className="ml-auto">
            <details ref={detailsRef} className="relative">
              <summary className="list-none select-none cursor-pointer rounded-md border px-2 py-1 bg-white hover:bg-slate-50 flex items-center gap-2">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="avatar" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-slate-200 grid place-items-center text-xs text-slate-700">
                    {initialsFrom(displayName)}
                  </div>
                )}
                <span className="text-sm">{displayName}</span>
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
