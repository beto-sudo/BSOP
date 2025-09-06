// app/_components/Topbar.tsx
"use client";

import { useEffect, useState } from "react";
import { User, LogOut, Shield } from "lucide-react";
import Link from "next/link";

export default function Topbar() {
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    // BrandingClient ya actualiza el title; aquí sólo leemos del title por simplicidad
    // Si prefieres: inyecta un <meta name="company-name"> desde BrandingLoader.
    const t = document.title;
    const parts = t.split("·");
    if (parts.length > 1) {
      setCompanyName(parts[0].trim());
    } else {
      setCompanyName(null);
    }
  }, []);

  return (
    <header className="sticky top-0 z-30 h-12 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-full items-center justify-between px-4">
        <div className="text-sm font-semibold text-slate-800">
          {companyName ?? "BSOP"}
        </div>

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
