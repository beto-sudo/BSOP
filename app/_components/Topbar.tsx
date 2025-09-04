// app/_components/Topbar.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type UserInfo = {
  email: string | null;
  fullName?: string | null;
  avatar_url?: string | null;
};

function useAuthUser(): UserInfo | null {
  const [info, setInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const supa = supabaseBrowser();
    supa.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        const u = data?.user ?? null;
        if (!u) return setInfo(null);
        const meta = (u.user_metadata || u.app_metadata || {}) as any;
        setInfo({
          email: u.email ?? null,
          fullName:
            meta.full_name ||
            meta.fullName ||
            [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
            null,
          avatar_url: meta.avatar_url || null,
        });
      })
      .catch(() => setInfo(null));
    return () => {
      alive = false;
    };
  }, []);

  return info;
}

export default function Topbar() {
  const router = useRouter();
  const qp = useSearchParams();
  const pathname = usePathname();
  const user = useAuthUser();

  const companySlug = (qp.get("company") || "").toUpperCase();
  const showCompany = useMemo(() => companySlug || "", [companySlug]);

  // --- superadmin flag (protegido por servidor) ---
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-superadmin")
      .then((r) => (r.ok ? r.json() : { is: false }))
      .then((j) => {
        if (alive) setIsSuperadmin(!!j.is);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // --- dropdown simple con <details> para evitar libs ---
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // cierra el dropdown al navegar
    detailsRef.current?.removeAttribute("open");
  }, [pathname, companySlug]);

  async function signOut() {
    try {
      const supa = supabaseBrowser();
      await supa.auth.signOut();
    } catch {}
    router.push("/signin");
  }

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/80 backdrop-blur border-b">
      <div className="h-full mx-auto max-w-[1400px] px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* IZQUIERDA: título/empresa */}
        <div className="min-w-0">
          <div className="text-xs text-slate-500 leading-none">ANSA</div>
          <div className="text-sm font-semibold truncate">{showCompany || "BSOP"}</div>
        </div>

        {/* DERECHA: acciones + usuario */}
        <div className="flex items-center gap-2">
          {/* Ejemplo: botón imprimir (opcional) */}
          {/* <button
            title="Imprimir"
            onClick={() => window.print()}
            className="hidden sm:inline-flex h-8 rounded-full border px-3 text-xs hover:bg-slate-50"
          >
            Imprimir
          </button> */}

          {/* Menú de usuario */}
          <details ref={detailsRef} className="relative">
            <summary className="list-none cursor-pointer select-none">
              <div className="h-9 rounded-full border px-2 pr-3 flex items-center gap-2 hover:bg-slate-50">
                <div className="h-6 w-6 rounded-full overflow-hidden border bg-white grid place-items-center">
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar_url}
                      alt="avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-slate-500">👤</span>
                  )}
                </div>
                <span className="hidden sm:inline text-xs font-medium max-w-[180px] truncate">
                  {user?.fullName || user?.email || "Cuenta"}
                </span>
              </div>
            </summary>

            <div className="absolute right-0 mt-2 w-64 rounded-2xl border bg-white shadow-md overflow-hidden">
              <div className="px-3 py-2">
                <div className="text-xs text-slate-500">Sesión</div>
                <div className="text-sm font-medium truncate">
                  {user?.fullName || "—"}
                </div>
                <div className="text-xs text-slate-500 truncate">{user?.email || "—"}</div>
              </div>

              <div className="h-px bg-slate-100" />

              <nav className="p-1">
                <Link
                  href="/settings/profile"
                  className="block px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
                >
                  Perfil y ajustes
                </Link>

                {/* Solo para superadmins */}
                {isSuperadmin && (
                  <Link
                    href="/settings/admin"
                    className="block px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
                  >
                    Panel de superadmin
                  </Link>
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
  );
}
