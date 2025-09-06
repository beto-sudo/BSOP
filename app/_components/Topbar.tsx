// app/_components/Topbar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Brush, User, LogOut, Shield } from "lucide-react";

export default function Topbar() {
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isBSOP = !companyName;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/current-company", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setCompanyName(json?.companyName ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function clearCompany() {
    // Limpiar empresa => modo BSOP (branding por defecto)
    await fetch("/api/switch-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: null }),
    }).catch(() => {});
    window.location.reload();
  }

  return (
    <header className="sticky top-0 z-30 h-12 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-full items-center justify-between px-4">
        {/* IZQUIERDA: Indicador de estado (Empresa / BSOP) */}
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
              isBSOP
                ? "bg-slate-900 text-white" // chip oscuro para BSOP
                : "bg-lime-100 text-lime-900", // chip marca empresa
            ].join(" ")}
            title={isBSOP ? "Sin empresa seleccionada" : "Empresa actual"}
          >
            <Building2 className="h-4 w-4" />
            {loading ? "Cargando…" : companyName ?? "BSOP"}
          </span>

          {/* Botón rápido para limpiar empresa */}
          {!isBSOP && (
            <button
              type="button"
              onClick={clearCompany}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Quitar selección de empresa (usar branding BSOP)"
            >
              <Brush className="h-4 w-4" />
              Limpiar empresa
            </button>
          )}
        </div>

        {/* DERECHA: Acciones de usuario */}
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

          {/* Ajusta esta acción si usas otro flujo de signout */}
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
