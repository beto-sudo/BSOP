"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CompanyAvatar from "./CompanyAvatar";
import { ChevronRight, ShoppingCart, Boxes, FileText, Settings } from "lucide-react";

type Company = { id: string; name: string; slug: string };
type NavItem = { label: string; href: string; icon?: React.ReactNode };
type Section = { key: string; label: string; items: NavItem[] };

const SECTIONS: Section[] = [
  {
    key: "operacion",
    label: "OPERACIÓN",
    items: [
      { label: "Órdenes de Compra", href: "/purchases", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "Inventario · Productos", href: "/inventory/products", icon: <Boxes className="h-4 w-4" /> },
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

  // Carga empresas
  useEffect(() => {
    (async () => {
      try {
        setLoadErr(null);
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

  // Si no hay ?company y sí hay empresas, auto-selecciona la primera
  useEffect(() => {
    if (!company && companies.length > 0) {
      const slug = companies[0].slug;
      document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
      router.replace(`/?company=${slug}`); // replace para no ensuciar el historial
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
        console.warn("No pude cargar la empresa");
        // No alert aquí para no bloquear; el UI sigue funcionando
      }
    })();
  }, [company]);

  const withCompany = (href: string) =>
    href.includes("?") ? `${href}&company=${company}` : `${href}?company=${company}`;

  const storageKey = useMemo(() => `bsop:sidebar:${company || "none"}`, [company]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    let initial: Record<string, boolean> = saved ? JSON.parse(saved) : {};
    const contains = (s: Section) => s.items.some((i) => pathname?.startsWith(i.href));
    if (!Object.values(initial).some(Boolean)) {
      const target = SECTIONS.find(contains);
      if (target) initial[target.key] = true;
    }
    setOpen(initial);
  }, [pathname, storageKey]);

  useEffect(() => {
    if (Object.keys(open).length) localStorage.setItem(storageKey, JSON.stringify(open));
  }, [open, storageKey]);

  const isActive = (href: string) => pathname?.startsWith(href);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  function onChangeCompany(slug: string) {
    document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/?company=${slug}`);
    router.refresh();
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
        {loadErr && <div className="mt-1 text-[11px] text-red-600">{loadErr}</div>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {SECTIONS.map((sec) => (
          <div key={sec.key} className="mb-2">
            <button
              onClick={() => toggle(sec.key)}
              aria-expanded={!!open[sec.key]}
              className={`w-full flex items-center justify-between text-[11px] tracking-wide px-3 py-2 rounded-xl 
                         ${open[sec.key] ? "bg-white border" : "hover:bg-white/60"} border`}
            >
              <span className="font-semibold text-slate-600">{sec.label}</span>
              <ChevronRight className={`h-4 w-4 opacity-60 transition-transform ${open[sec.key] ? "rotate-90" : ""}`} />
            </button>

            {open[sec.key] && (
              <ul className="mt-1 space-y-1">
                {sec.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={withCompany(item.href)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-xl border 
                                  ${isActive(item.href)
                                    ? "bg-[var(--brand-50)] border-[var(--brand-200)] text-[var(--brand-900)]"
                                    : "bg-white border-transparent hover:border-[var(--brand-200)]"}`}
                    >
                      <span className={`opacity-70 ${isActive(item.href) ? "text-[var(--brand-700)]" : "text-slate-500"}`}>
                        {item.icon ?? <ChevronRight className="h-4 w-4" />}
                      </span>
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
