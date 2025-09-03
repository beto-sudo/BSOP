"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ShoppingCart, Boxes, FileText, Settings, Users, Shield } from "lucide-react";

type Company = { id: string; name: string; slug: string };
type NavItem = { label: string; href: string; icon?: React.ReactNode };
type Section = { key: string; label: string; items: NavItem[] };

type Branding = {
  brandName?: string;
  primary?: string;
  secondary?: string;
  logoUrl?: string;
};

function InitialsIcon({ name }: { name: string }) {
  const initials = useMemo(() => {
    const parts = (name || "BSOP").trim().split(" ");
    const a = (parts[0]?.[0] || "").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return (a + b || "B").slice(0, 2);
  }, [name]);

  return (
    <div className="h-10 w-10 rounded-md bg-[var(--brand-100)] grid place-items-center text-[var(--brand-800)] text-xs font-semibold">
      {initials}
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    key: "purchases",
    label: "Compras",
    items: [
      { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" /> },
    ],
  },
  {
    key: "inventory",
    label: "Inventario",
    items: [
      { label: "Movimientos de Inventario", href: "/inventory/moves", icon: <Boxes className="h-4 w-4" /> },
      { label: "Productos", href: "/products", icon: <Boxes className="h-4 w-4" /> },
    ],
  },
  {
    key: "admin",
    label: "Administración",
    items: [{ label: "Legal / Documentos", href: "/admin/legal", icon: <FileText className="h-4 w-4" /> }],
  },
  {
    key: "settings",
    label: "Configuración",
    items: [
      { label: "Empresa", href: "/admin/company", icon: <Settings className="h-4 w-4" /> },
      { label: "Branding", href: "/admin/branding", icon: <Settings className="h-4 w-4" /> },
      { label: "Usuarios", href: "/settings/users", icon: <Users className="h-4 w-4" /> },
      { label: "Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const qp = useSearchParams();
  const companySlug = (qp.get("company") || "").toLowerCase();

  const [openKey, setOpenKey] = useState<string>("purchases");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<string>(companySlug);
  const [brandTitle, setBrandTitle] = useState<string>("BSOP");
  const [logoUrl, setLogoUrl] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/company/list", { cache: "no-store" });
        const json = await r.json();
        const list = (json?.companies || []) as Company[];
        setCompanies(list);
      } catch (e) {
        console.error("companies load error", e);
      }
    })();
  }, []);

  useEffect(() => {
    // Branding actual (opcionalmente lo puedes sacar de ThemeLoader via dataset/localStorage si así lo manejas)
    (async () => {
      try {
        if (!companySlug) {
          setBrandTitle("BSOP");
          setLogoUrl("");
          return;
        }
        const r = await fetch(`/api/admin/company?company=${companySlug}`, { cache: "no-store" });
        const json = await r.json();
        const b: Branding = json?.settings?.branding || {};
        setBrandTitle(b.brandName || json?.name || "BSOP");
        setLogoUrl(b.logoUrl || "");
      } catch (e) {
        console.error("branding load error", e);
      }
    })();
  }, [companySlug]);

  useEffect(() => {
    if (companySlug) setSelected(companySlug);
  }, [companySlug]);

  function toggleKey(k: string) {
    setOpenKey((prev) => (prev === k ? "" : k));
  }

  function onSelectCompany(slug: string) {
    setSelected(slug);
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("company", slug);
    else url.searchParams.delete("company");
    router.push(url.pathname + "?" + url.searchParams.toString());
    // Si usas ThemeLoader con event/localStorage puedes disparar aquí:
    // window.dispatchEvent(new CustomEvent("branding:updated", { detail: { company: slug } }));
    // localStorage.setItem("branding:updated", Date.now().toString());
  }

  // Empresa activa (para agregar companyId al href)
  const currentCompany = companies.find((c) => c.slug?.toLowerCase() === companySlug);

  return (
    <aside className="w-72 h-screen flex flex-col border-r border-[var(--brand-200)] bg-[var(--brand-50)]">
      <div className="flex items-center gap-3 p-4">
        {logoUrl ? (
          <div className="h-10 w-10 rounded-md border border-[var(--brand-200)] bg-[var(--brand-50)] p-1 grid place-items-center">
            <img src={logoUrl} alt={brandTitle} className="h-full w-full object-contain" loading="eager" referrerPolicy="no-referrer" />
          </div>
        ) : (
          <InitialsIcon name={brandTitle} />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{brandTitle}</div>
          <div className="text-[11px] text-slate-500">BSOP · Multiempresa</div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <label className="block text-xs text-slate-500 mb-1">Empresa</label>
        <select
          className="w-full rounded-2xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
          value={selected}
          onChange={(e) => onSelectCompany(e.target.value)}
        >
          <option value="">Selecciona...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.slug.toLowerCase()}>{c.name}</option>
          ))}
        </select>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-2">
        {SECTIONS.map((s) => {
          const isOpen = openKey === s.key;
          return (
            <div key={s.key} className="rounded-xl border border-[var(--brand-200)] bg-[var(--brand-50)]">
              <button onClick={() => toggleKey(s.key)} className="w-full flex items-center justify-between px-3 py-2 text-left">
                <span className="text-[11px] font-semibold tracking-wider text-slate-600">{s.label}</span>
                <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>

              {isOpen && (
                <ul className="py-1">
                  {s.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");

                    // agrega company param si hay empresa activa
                    const href = currentCompany ? `${item.href}?company=${currentCompany.slug}` : item.href;

                    return (
                      <li key={item.href}>
                        <Link
                          href={href}
                          className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            active ? "text-[var(--brand-800)] bg-[var(--brand-50)]" : "text-[var(--brand-700)] hover:bg-[var(--brand-50)] hover:text-[var(--brand-800)]"
                          }`}
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
