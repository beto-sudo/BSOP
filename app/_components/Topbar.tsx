// app/_components/Topbar.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Printer, Settings as SettingsIcon, LayoutGrid } from "lucide-react";

type UserInfo = { name?: string; email?: string; picture?: string };
type Branding = { brandName?: string };

export default function Topbar() {
  const router = useRouter();
  const qp = useSearchParams();
  const company = qp.get("company") || "";
  const [user, setUser] = useState<UserInfo | null>(null);
  const [brand, setBrand] = useState<Branding>({});
  const [open, setOpen] = useState(false);

  // Cargar usuario
  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const meta: any = data.user?.user_metadata || {};
      setUser({
        name: meta.name || data.user?.email || "Usuario",
        email: data.user?.email || "",
        picture: meta.avatar_url || meta.picture || "",
      });
    })();
  }, []);

  // Cargar brandName
  useEffect(() => {
    (async () => {
      try {
        if (!company) return;
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const json = await r.json();
        const b = json?.settings?.branding || {};
        setBrand({ brandName: b.brandName || json?.name || "" });
      } catch {}
    })();
  }, [company]);

  const onLogout = async () => {
    try {
      const supabase = supabaseBrowser();
      await supabase.auth.signOut();
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } finally {
      const redirect = encodeURIComponent(window.location.pathname + (window.location.search || ""));
      router.replace(`/signin?redirect=${redirect}`);
      window.location.assign(`/signin?redirect=${redirect}`);
    }
  };

  function onPrint() {
    window.print();
  }

  const initials = (user?.name || "")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const accountHref = company ? `/settings/account?company=${company}` : "/settings/account";

  return (
    <header className="h-14 border-b bg-white/80 backdrop-blur flex items-center justify-between px-4 print:hidden">
      {/* Izquierda: botón Empresas + nombre de la empresa */}
      <div className="flex items-center gap-2">
        <a
          href="/companies"
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-slate-50"
          title="Empresas"
          aria-label="Empresas"
        >
          <LayoutGrid className="h-4 w-4" />
        </a>
        <div className="text-sm text-slate-500">
          {brand?.brandName ? <span className="font-medium">{brand.brandName}</span> : <span>&nbsp;</span>}
        </div>
      </div>

      {/* Derecha: acciones */}
      <div className="flex items-center gap-2">
        {/* Imprimir / PDF */}
        <button
          onClick={onPrint}
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border hover:bg-slate-50"
          title="Imprimir / PDF (⌘/Ctrl+P)"
          aria-label="Imprimir o guardar como PDF"
        >
          <Printer className="h-4 w-4" />
        </button>

        {/* Usuario */}
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-full border pl-1 pr-2 py-1 hover:bg-slate-50"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name || "avatar"}
                className="h-8 w-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-slate-200 grid place-items-center text-xs font-semibold">
                {initials || "U"}
              </div>
            )}
            <span className="text-sm max-w-[160px] truncate">{user?.name || "Usuario"}</span>
          </button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg z-10"
              onMouseLeave={() => setOpen(false)}
              role="menu"
            >
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                  setOpen(false);
                  router.push(accountHref);
                }}
                role="menuitem"
              >
                <SettingsIcon className="h-4 w-4" />
                Perfil y ajustes
              </button>

              <div className="my-1 h-px bg-slate-200" />

              <div className="px-3 py-2 border-b">
                <div className="text-sm font-medium truncate">{user?.name || "Usuario"}</div>
                {user?.email && <div className="text-xs text-slate-500 truncate">{user.email}</div>}
              </div>

              <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={onLogout} role="menuitem">
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
