// app/_components/Sidebar.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CompanyAvatar from "./CompanyAvatar";
import {
  ChevronRight,
  ShoppingCart,
  Boxes,
  FileText,
  Settings,
} from "lucide-react";

type Company = { id: string; name: string; slug: string };
type NavItem = { label: string; href: string; icon?: React.ReactNode };
type Section = { key: string; label: string; items: NavItem[] };

const SECTIONS: Section[] = [
  {
    key: "operacion",
    label: "OPERACIÓN",
    items: [
      { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "Movimientos de Inventario", href: "/inventory/moves", icon: <Boxes className="h-4 w-4" /> },
      { label: "Productos", href: "/products", icon: <Boxes className="h-4 w-4" /> },
    ],
  },
  {
    key: "administracion",
    label: "ADMINISTRACIÓN",
    items: [{ label: "Legal / Documentos", href: "/admin/legal", icon: <FileText className="h-4 w-4" /> }],
  },
  {
    key: "configuracion",
    label: "CONFIGURACIÓN",
    items: [
      { label: "Empresa", href: "/admin/company", icon: <Settings className="h-4 w-4" /> },
      { label: "Branding", href: "/admin/branding", icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export default function Sidebar() {
  const router = useRouter();
  const qp = useSearchParams();
  const pathname = usePathname();
  const company = (qp.get("company") || "").toLowerCase();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // secciones: solo una abierta
  const [openKey, setOpenKey] = useState<string | null>("operacion");

  const activeKeyFromPath = useMemo(() => {
    for (const s of SECTIONS) {
      if (s.items.some((i) => pathname.startsWith(i.href))) return s.key;
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    if (activeKeyFromPath) setOpenKey(activeKeyFromPath);
  }, [activeKeyFromPath]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/companies", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch (e: any) {
        console.error("Error /api/companies:", e);
        setLoadErr("No pude cargar la lista de empresas");
      }
    })();
  }, []);

  // Auto-selecciona empresa si falta el ?company
  useEffect(() => {
    if (!company && companies.length > 0) {
      const slug = companies[0].slug;
      document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
      router.replace(`/?company=${slug}`);
    }
  }, [company, companies, router]);

  // Branding (logo + nombre)
  useEffect(() => {
    if (!company) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        const b = json?.settings?.branding ?? {};
        setLogoUrl(b.logoUrl || null);
        setBrandName(b.brandName || json?.name || "");
      } catch (e) {
        console.error(e);
        setLogoUrl(null);
        setBrandName("");
      }
    })();
  }, [company]);

  function onChangeCompany(slug: string) {
    document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/?company=${slug}`);
    router.refresh();
  }

  function toggleKey(k: string) {
    setOpenKey((curr) => (curr === k ? null : k));
  }

  return (
    <aside className="w-72 border-r bg-[var(--brand-50)]/40 h-screen flex flex-col">
      <div className="flex items-center gap-3 p-4">
        <CompanyAvatar src={logoUrl || undefined} name={brandName} size={36} />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{brandName || "—"}</div>
          <div className="text-[11px] text-slate-500">Core · Multiempresa</div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <label className="block text-xs text-slate-500 mb-1">Empresa</label>
        <select
          className="w-full rounded-2xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
          value={company || ""}
          onChange={(e) => onChangeCompany(e.target.value)}
        >
          {companies.length === 0 ? (
            <option value="">(sin empresas)</option>
          ) : (
            companies.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))
          )}
        </select>
        {loadErr && <p className="mt-2 text-xs text-red-600">{loadErr}</p>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-2">
        {SECTIONS.map((s) => {
          const isOpen = openKey === s.key;
          return (
            <div key={s.key} className="rounded-xl border bg-white">
              <button
                onClick={() => toggleKey(s.key)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <span className="text-[11px] font-semibold tracking-wider text-slate-600">
                  {s.label}
                </span>
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>

              {isOpen && (
                <ul className="py-1">
                  {s.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <li key={item.href}>
                        <Link
                          href={company ? `${item.href}?company=${company}` : item.href}
                          className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors
                            ${active ? "text-[var(--brand-700)] bg-[var(--brand-50)]" : "text-slate-700 hover:bg-slate-50"}
                          `}
                          onClick={() => setOpenKey(s.key)}
                        >
                          <span className="opacity-80">{item.icon ?? <ChevronRight className="h-4 w-4" />}</span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
