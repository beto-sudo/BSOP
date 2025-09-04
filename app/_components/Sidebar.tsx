"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { buildSections, Section } from "@/app/_config/nav";

type Company = { id: string; name: string; slug: string };
type Branding = { brandName?: string; primary?: string; secondary?: string; logoUrl?: string };

function InitialsIcon({ name }: { name: string }) {
  const initials = (name || "").split(" ").map(s=>s[0]).join("").slice(0,2).toUpperCase() || "B";
  return <div className="h-10 w-10 rounded-md bg-[var(--brand-100)] text-[var(--brand-800)] grid place-items-center text-xs font-semibold">{initials}</div>;
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

  // ancho
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

  // sólo forzar ?company en rutas que lo requieren
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

  // branding
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
        if (b?.primary) document.documentElement.style.setProperty("--brand-50", b.primary);
      } catch {}
    })();
  }, [companySlug]);

  // superadmin
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/is-superadmin")
      .then(r => r.ok ? r.json() : { is:false })
      .then(j => { if (alive) setIsSuperadmin(!!j.is); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const sections = buildSections(isSuperadmin);

  const activeKeyFromPath = useMemo(() => {
    const p = pathname || "";
    if (p.startsWith("/settings/admin") || p.startsWith("/settings/access")) return "superadmin";
    if (p.startsWith("/settings") || p.startsWith("/admin")) return "config";
    return "operacion";
  }, [pathname]);
  useEffect(() => { if (activeKeyFromPath) setOpenKey(activeKeyFromPath); }, [activeKeyFromPath]);

  // drag resizer
  useEffect(() => {
    const resizer = resizerRef.current; if (!resizer) return;
    let dragging=false, startX=0, startW=0;
    function down(e:MouseEvent){ dragging=true; startX=e.clientX; startW=width; document.body.style.userSelect="none"; }
    function move(e:MouseEvent){ if(!dragging) return; const dx=e.clientX-startX; setWidth(Math.max(220, Math.min(420, startW+dx))); }
    function up(){ dragging=false; document.body.style.userSelect=""; }
    resizer.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { resizer.removeEventListener("mousedown", down); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [width]);

  const current = companies.find(c => c.slug.toLowerCase() === companySlug) || null;

  function renderSection(sec: Section) {
    const isOpen = openKey === sec.key;
    return (
      <div key={sec.key} className="rounded-lg border overflow-hidden">
        <button className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-slate-50" onClick={() => setOpenKey(k => k === sec.key ? null : sec.key)}>
          <span>{sec.label}</span>
          <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        {isOpen && (
          <ul className="py-1">
            {sec.items.map(item => {
              const href = item.needsCompany && companySlug ? `${item.href}?company=${companySlug}` : item.href;
              const active = (pathname || "").startsWith(item.href);
              return (
                <li key={`${sec.key}:${item.href}`}>
                  <Link href={href} className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${active ? "text-[var(--brand-800)] font-medium" : "text-slate-700"}`}>
                    {item.icon}<span className="truncate">{item.label}</span>
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
      <div ref={resizerRef} className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-slate-200" title="Arrastra para ajustar ancho" />

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

      <div className="p-3 border-b">
        <label className="block text-xs text-slate-500 mb-1">Empresa</label>
        <select className="w-full rounded-md border px-2 py-1 text-sm" value={companySlug}
          onChange={(e) => {
            const slug = e.target.value;
            document.cookie = `company=${slug}; path=/; max-age=31536000; samesite=lax`;
            const url = new URL(window.location.href);
            url.searchParams.set("company", slug);
            router.push(url.pathname + "?" + url.searchParams.toString());
            router.refresh();
          }}>
          <option value="">Selecciona...</option>
          {companies.map(c => <option key={c.id} value={c.slug.toLowerCase()}>{c.name}</option>)}
        </select>
      </div>

      <nav className="p-2 space-y-2">
        {sections.map(renderSection)}
      </nav>
    </aside>
  );
}
