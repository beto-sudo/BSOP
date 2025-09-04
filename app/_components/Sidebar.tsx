"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buildSectionsOrdered, Section, NavMenu, NavItem } from "@/app/_config/nav";

type Company = { id: string; name: string; slug: string };
type Branding = { brandName?: string; primary?: string; secondary?: string; logoUrl?: string };
type Features = Record<string, boolean>;

function InitialsIcon({ name }: { name: string }) {
  const initials = (name || "").split(" ").map(s=>s[0]).join("").slice(0,2).toUpperCase() || "B";
  return <div className="h-10 w-10 rounded-md bg-[var(--brand-100,#eef2ff)] text-[var(--brand-800,#1e293b)] grid place-items-center text-xs font-semibold">{initials}</div>;
}

/** Utilidad para derivar tonos de la marca */
function shade(hex: string, percent: number) {
  // percent: -100..100 (negro..blanco)
  const m = hex.replace("#","").match(/.{1,2}/g);
  if (!m) return hex;
  const [r,g,b] = m.map(x => parseInt(x,16));
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const rn = Math.round((t - r) * p + r);
  const gn = Math.round((t - g) * p + g);
  const bn = Math.round((t - b) * p + b);
  const toHex = (n:number) => n.toString(16).padStart(2,"0");
  return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`;
}

export default function Sidebar() {
  const router = useRouter();
  const qp = useSearchParams();
  const pathname = usePathname();

  const companySlug = (qp.get("company") || "").toLowerCase();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [features, setFeatures] = useState<Features>({});
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  // estado de apertura: una sección y un menú a la vez
  const [openSectionKey, setOpenSectionKey] = useState<string>("administracion");
  const [openMenuKey, setOpenMenuKey] = useState<string>("");

  // ancho redimensionable
  const asideRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(260);
  useEffect(() => { const w=Number(localStorage.getItem("sidebar:w")); if (w>=220 && w<=420) setWidth(w); }, []);
  useEffect(() => { localStorage.setItem("sidebar:w", String(width)); if (asideRef.current) asideRef.current.style.width = `${width}px`; }, [width]);

  // cargar empresas
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/companies", { cache: "no-store" });
        const list = await r.json();
        setCompanies(Array.isArray(list) ? list : []);
      } catch {}
    })();
  }, []);

  // forzar ?company solo en rutas que lo requieren
  useEffect(() => {
    const requiresCompany = !(
      pathname === "/companies" ||
      pathname.startsWith("/companies") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/auth") ||
      pathname.startsWith("/signin") ||
      pathname.startsWith("/api")
    );
    if (!companySlug && companies.length > 0 && requiresCompany) {
      const slug = companies[0]?.slug?.toLowerCase();
      if (!slug) return;
      document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
      const url = new URL(window.location.href);
      url.searchParams.set("company", slug);
      router.replace(url.pathname + "?" + url.searchParams.toString());
    }
  }, [companySlug, companies, pathname, router]);

  // branding + features por empresa (y aplicar variables CSS globales)
  useEffect(() => {
    (async () => {
      try {
        if (!companySlug) return;
        const r = await fetch(`/api/admin/company?company=${companySlug}`, { cache: "no-store" });
        const json = await r.json();
        const b: Branding = json?.settings?.branding ?? {};
        const f: Features = json?.settings?.features ?? {};
        setBranding({
          brandName: b?.brandName || json?.name || "",
          primary: b?.primary || "#334155",
          secondary: b?.secondary || "#64748b",
          logoUrl: b?.logoUrl || "",
        });
        setFeatures(f || {});
        const primary = (b?.primary || "#334155") as string;
        const root = document.documentElement;
        root.style.setProperty("--brand-50", shade(primary, 88));
        root.style.setProperty("--brand-100", shade(primary, 75));
        root.style.setProperty("--brand-200", shade(primary, 60));
        root.style.setProperty("--brand-800", shade(primary, -10));
        root.style.setProperty("--brand-900", shade(primary, -20));
        root.style.setProperty("--brand-primary", primary);
      } catch {}
    })();
  }, [companySlug]);

  // superadmin flag
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-superadmin")
      .then(r => r.ok ? r.json() : { is:false })
      .then(j => { if (alive) setIsSuperadmin(!!j.is); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // construir secciones en orden fijo
  const sections: Section[] = useMemo(() => buildSectionsOrdered(isSuperadmin), [isSuperadmin]);

  // auto-abrir sección y menú del ítem activo
  useEffect(() => {
    const p = pathname || "";
    for (const sec of sections) {
      for (const menu of sec.menus) {
        for (const item of menu.items) {
          if (p.startsWith(item.href)) {
            setOpenSectionKey(sec.key);
            setOpenMenuKey(`${sec.key}:${menu.key}`);
            return;
          }
        }
      }
    }
  }, [pathname, sections]);

  function isItemVisible(item: NavItem): boolean {
    // Mostrar TODO el menú: no ocultamos por enabled/feature; sólo aplicamos filtros
    if (item.enabledForCompanies && item.enabledForCompanies.length > 0) {
      if (!companySlug) return false;
      if (!item.enabledForCompanies.map(s => s.toLowerCase()).includes(companySlug)) return false;
    }
    if (item.enabledByFeature) {
      const key = item.enabledByFeature;
      if (!features || features[key] !== true) return false;
    }
    return true;
  }

  function renderMenu(sec: Section, menu: NavMenu) {
    const isOpen = openMenuKey === `${sec.key}:${menu.key}`;
    return (
      <div key={menu.key} className="border-t first:border-t-0">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-[var(--brand-50)]"
          onClick={() => setOpenMenuKey(isOpen ? "" : `${sec.key}:${menu.key}`)}
        >
          <span className="flex items-center gap-2">{menu.icon}<span>{menu.label}</span></span>
          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        {isOpen && (
          <ul className="py-1">
            {menu.items.filter(isItemVisible).map((item) => {
              const href = item.needsCompany && companySlug
                ? `${item.href}?company=${companySlug}`
                : item.href;
              const active = (pathname || "").startsWith(item.href);
              return (
                <li key={`${menu.key}:${item.href}`}>
                  <Link
                    href={href}
                    className={`block px-6 py-2 text-sm hover:bg-[var(--brand-50)] ${
                      active ? "text-[var(--brand-800)] font-medium" : "text-slate-700"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  function renderSection(sec: Section) {
    const isOpen = openSectionKey === sec.key;
    return (
      <div key={sec.key} className="rounded-lg border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-slate-50"
          onClick={() => setOpenSectionKey(isOpen ? "" : sec.key)}
        >
          <span>{sec.label}</span>
          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        {isOpen && (
          <div className="pb-1">
            {sec.menus.map((menu) => renderMenu(sec, menu))}
          </div>
        )}
      </div>
    );
  }

  const current = companies.find(c => c.slug.toLowerCase() === companySlug) || null;

  return (
    <aside ref={asideRef} className="relative border-r bg-white shrink-0" style={{ width }}>
      {/* Resizer */}
      <div
        ref={resizerRef}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-slate-200"
        title="Arrastra para ajustar ancho"
      />

      {/* Header empresa */}
      <div className="p-4 border-b flex items-center gap-3">
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="logo" className="h-10 w-10 rounded-md object-cover" />
        ) : <InitialsIcon name={branding?.brandName || current?.name || "BS"} />}
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{branding?.brandName || current?.name || "Sin empresa"}</div>
          <div className="text-xs text-slate-500 truncate">{current?.slug || "—"}</div>
        </div>
      </div>

      {/* Selector de empresa */}
      <div className="p-3 border-b">
        <label className="block text-xs text-slate-500 mb-1">Empresa</label>
        <select
          className="w-full rounded-md border px-2 py-1 text-sm"
          value={companySlug}
          onChange={(e) => {
            const slug = e.target.value;
            document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
            const url = new URL(window.location.href);
            url.searchParams.set("company", slug);
            router.push(url.pathname + "?" + url.searchParams.toString());
            router.refresh();
          }}
        >
          <option value="">Selecciona...</option>
          {companies.map(c => <option key={c.id} value={c.slug.toLowerCase()}>{c.name}</option>)}
        </select>
      </div>

      {/* Navegación: ADMINISTRACIÓN → OPERACIÓN → CONFIGURACIÓN → (SUPERADMIN si aplica) */}
      <nav className="p-2 space-y-2">
        {sections.map(renderSection)}
      </nav>
    </aside>
  );
}
