// app/_components/Topbar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, LogOut, Shield } from "lucide-react";

export default function Topbar() {
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/current-company", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setCompanyName(json?.companyName ?? null);
        }
      } catch {
        /* noop */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 h-12 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-full items-center justify-between px-4">
        {/* Izquierda: nombre de empresa o BSOP */}
        <div className="text-sm font-semibold text-slate-800">
          {companyName ?? "BSOP"}
        </div>

        {/* Derecha: acciones */}
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            <User className="h-4 w-4" />
            <span>Perfil y ajustes</span>
          </Link>

          <Link
            href="/superadmin"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            <Shield className="h-4 w-4" />
            <span>Panel de superadmin</span>
          </Link>

          {/* Ajusta esta acción a tu flujo de signout con Supabase/NextAuth */}
          <form action="/api/auth/signout" method="post">
            <button
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-slate-100"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
