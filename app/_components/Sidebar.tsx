"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ShoppingCart, Boxes, FileText, Settings, Users, Shield } from "lucide-react";

type Company = { id: string; name: string; slug: string };
type NavItem = { label: string; href: string; icon?: React.ReactNode; needsCompany?: boolean };
type Section = { key: string; label: string; items: NavItem[] };
type Branding = { brandName?: string; primary?: string; secondary?: string; logoUrl?: string };

const SECTIONS: Section[] = [
  {
    key: "operacion",
    label: "OPERACIÓN",
    items: [
      { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
      { label: "Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
      { label: "Inventario", href: "/inventory", icon: <Boxes className="h-4 w-4" />, needsCompany: true },
      { label: "Reportes", href: "/reports", icon: <FileText className="h-4 w-4" />, needsCompany: true },
    ],
  },
  {
    key: "config",
    label: "CONFIGURACIÓN",
    items: [
      { label: "Empresa (Branding)", href: "/admin/branding", icon: <Settings className="h-4 w-4" />, needsCompany: true },
      { label: "Datos Fiscales", href: "/admin/legal", icon: <Settings className="h-4 w-4" />, needsCompany: true },
      { label: "Datos Generales", href: "/admin/company", icon: <Settings className="h-4 w-4" />, needsCompany: true },
      { label: "Usuarios", href: "/settings/users", icon: <Users className="h-4 w-4" /> },
      { label: "Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" /> },
    ],
  },
];

const ADMIN_SECTION: Section = {
  key: "superadmin",
  label: "ADMINISTRACIÓN",
  items: [
    { label: "Panel Superadmin", href: "/settings/admin", icon: <Shield className="h-4 w-4" /> },
    { label: "Accesos", href: "/settings/access", icon: <Shield className="h-4 w-4" /> },
    { label: "Empresas", href: "/companies", icon: <Boxes className="h-4 w-4" /> },
    { label: "Usuarios (global)", href: "/settings/users", icon: <Users className="h-4 w-4" /> },
    { label: "Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" /> },
  ],
};

function InitialsIcon({ name }: { name: string }) {
  const initials =
    (name || "")
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "B";
  return (
    <div className="h-10 w-10 rounded-md bg-[var(--brand-100)] text-[var(--brand-800)] grid place-items-center text-xs font-semibold">
      {initials}
    </div>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const qp = useSearchParams();
  const pathname = usePathname();
  const companySlug = (qp.get("company") || "").toLowerCase();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [openKey, setOpenKey] = useState<string | null>("operacion");
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  // ancho redimensionable
  const asideRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(260);

  useEffect(() => {
    const saved = Number(localStorage.getItem("sidebar:w"));
    if (saved && saved >= 220 && saved <= 420) setWidth(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("sidebar:w", String(width));
    if (asideRef.current) asideRef.current.style.width = `${width}px`;
  }, [width]);

  // Cargar empresas
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/companies", { cache: "no-store" });
        const list = (await r.json()) as Company[];
        setCompanies(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error("Error /api/companies:", e);
      }
    })();
  }, []);

  // Sólo forzar ?company en rutas que realmente lo requieren
  useEffect(() => {
    const requiresCompany =
      !(
        pathname === "/companies" ||
        pathname.startsWith("/companies") ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/auth") ||
        pathname.startsWith("/signin") ||
        pathname.startsWith("/api")
      );

    if (!companySlug && companies.length > 0 && requiresCompany) {
      const first = companies[0];
      const slug = first.slug?.toLowerCase();
      if (!slug) return;
      document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
      const url = new URL(window.location.href);
      url.searchParams.set("company", slug);
      router.replace(url.pathname + "?" + url.searchParams.toString());
    }
  }, [companySlug, companies, pathname, router]);

  // Branding por empresa
  useEffect(() => {
    (async () => {
      try {
        if (!companySlug) return;
        const r = await fetch(`/api/admin/company?company=${companySlug}`, { cache: "no-store" });
        const json = await r.json();
        const b: Branding = json?.settings?.branding ?? {};
        setBranding({
          brandName: b?.brandName || json?.name || "",
          primary: b?.primary || "",
          secondary: b?.secondary || "",
          logoUrl: b?.logoUrl || "",
        });
        if (b?.primary) {
          document.documentElement.style.setProperty("--brand-50", b?.primary);
        }
      } catch {}
    })();
  }, [companySlug]);

  // Saber si eres superadmin
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-superadmin")
      .then((r) => (r.ok ? r.json() : { is: false }))
      .then((j) => alive && setIsSuperadmin(!!j.is))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Sección abierta por ruta
  const activeKeyFromPath = useMemo(() => {
    const p = pathname || "";
    if (p.startsWith("/settings/admin") || p.startsWith("/settings/access")) return "superadmin";
    if (p.startsWith("/settings") || p.startsWith("/admin")) return "config";
    return "operacion";
  }, [pathname]);

  useEffect(() => {
    if (activeKeyFromPath) setOpenKey(activeKeyFromPath);
  }, [activeKeyFromPath]);

  // Drag para redimensionar
  useEffect(() => {
    const resizer = resizerRef.current;
    if (!resizer) return;
    let dragging = false;
    let startX = 0;
    let startW = 0;
    function onDown(e: MouseEvent) {
      dragging = true;
      startX = e.clientX;
      startW = width;
      document.body.style.userSelect = "none";
    }
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const next = Math.max(220, Math.min(420, startW + dx));
      setWidth(next);
    }
    function onUp() {
      dragging = false;
      document.body.style.userSelect = "";
    }
    resizer.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      resizer.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const current = companies.find((c) => c.slug.toLowerCase() === companySlug) || null;

  function renderSection(sec: Section) {
    const isOpen = openKey === sec.key;
    return (
      <div key={sec.key} className="rounded-lg border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-slate-50"
          onClick={() => setOpenKey((k) => (k === sec.key ? null : sec.key))}
        >
          <span>{sec.label}</span>
          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        {isOpen && (
          <ul className="py-1">
            {sec.items.map((item) => {
              const href =
                item.needsCompany && companySlug
                  ? `${item.href}?company=${companySlug}`
                  : item.href;
              const active = (pathname || "").startsWith(item.href);
              return (
                <li key={`${sec.key}:${item.href}`}>
                  <Link
                    href={href}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                      active ? "text-[var(--brand-800)] font-medium" : "text-slate-700"
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

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
        ) : (
          <InitialsIcon name={branding?.brandName || current?.name || "BS"} />
        )}
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
          {companies.map((c) => (
            <option key={c.id} value={c.slug.toLowerCase()}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Navegación */}
      <nav className="p-2 space-y-2">
        {SECTIONS.map(renderSection)}
        {isSuperadmin && renderSection(ADMIN_SECTION)}
      </nav>
    </aside>
  );
}
