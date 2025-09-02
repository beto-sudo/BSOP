// app/_components/Topbar.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type UserInfo = { name?: string; email?: string; picture?: string };
type Branding = { brandName?: string };

export default function Topbar() {
  const router = useRouter();
  const qp = useSearchParams();
  const company = qp.get("company") || "";
  const [user, setUser] = useState<UserInfo | null>(null);
  const [brand, setBrand] = useState<Branding>({});
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        if (!company) return;
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        const json = await r.json();
        const b = json?.settings?.branding || {};
        setBrand({ brandName: b.brandName || json?.name || "" });
      } catch {
        setBrand({});
      }
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

  const initials = (user?.name || "")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-14 border-b bg-white/80 backdrop-blur flex items-center justify-between px-4">
      <div className="text-sm text-slate-500">
        {brand?.brandName ? <span className="font-medium">{brand.brandName}</span> : <span>&nbsp;</span>}
      </div>

      <div className="relative">
        <button
          className="flex items-center gap-2 rounded-full border px-2 py-1 hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
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
            className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-lg z-10"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-3 py-2 border-b">
              <div className="text-sm font-medium truncate">{user?.name || "Usuario"}</div>
              {user?.email && <div className="text-xs text-slate-500 truncate">{user.email}</div>}
            </div>
            <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={onLogout}>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
