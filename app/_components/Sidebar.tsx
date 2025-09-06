"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Settings,
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Boxes,
  HandCoins,
  Wallet,
  FileChartColumn,
  Shield,
  Building2,
} from "lucide-react";

/* --------------------------- util clsx minimalista --------------------------- */
function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

/* --------------------------- tipos de navegación ---------------------------- */
type MenuItem = {
  key: string;
  label: string;
  href: string;
  icon?: React.ReactNode;
};

type Section = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  items?: MenuItem[];
  href?: string; // si no tiene items, puede ser un link directo
};

/* -------------------------- árbol de navegación UI -------------------------- */
const NAV: Section[] = [
  {
    key: "administracion",
    label: "ADMINISTRACIÓN",
    icon: <Building2 className="h-4 w-4" />,
    items: [
      {
        key: "dashboard-admin",
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
    ],
  },
  {
    key: "operacion",
    label: "OPERACIÓN",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      {
        key: "kpis",
        label: "Inicio (KPIs)",
        href: "/operacion/kpis",
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        key: "dashboard-op",
        label: "Dashboard",
        href: "/operacion/dashboard",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        key: "compras",
        label: "Compras",
        href: "/operacion/compras",
        icon: <ShoppingCart className="h-4 w-4" />,
      },
      {
        key: "inventario",
        label: "Inventario",
        href: "/operacion/inventario",
        icon: <Boxes className="h-4 w-4" />,
      },
      {
        key: "ventas",
        label: "Ventas",
        href: "/operacion/ventas",
        icon: <HandCoins className="h-4 w-4" />,
      },
      {
        key: "caja",
        label: "Caja",
        href: "/operacion/caja",
        icon: <Wallet className="h-4 w-4" />,
      },
      {
        key: "reportes",
        label: "Reportes",
        href: "/operacion/reportes",
        icon: <FileChartColumn className="h-4 w-4" />,
      },
    ],
  },
  {
    key: "configuracion",
    label: "CONFIGURACIÓN",
    icon: <Settings className="h-4 w-4" />,
    items: [
      {
        key: "empresa-ajustes",
        label: "Empresa",
        href: "/configuracion/empresa",
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        key: "ajustes",
        label: "Ajustes",
        href: "/configuracion/ajustes",
        icon: <Settings className="h-4 w-4" />,
      },
    ],
  },
  {
    key: "superadmin",
    label: "SUPERADMIN",
    icon: <Shield className="h-4 w-4" />,
    href: "/superadmin",
  },
];

/* -------------------------- constantes de sidebar --------------------------- */
const LOCALSTORAGE_WIDTH_KEY = "sidebarWidth";
const MIN_W = 220;
const MAX_W = 420;
const DEFAULT_W = 260;

/* --------------------------- tipos de selector UX --------------------------- */
type CompanyLite = { id: string; name: string; slug?: string };

export default function Sidebar() {
  const pathname = usePathname();
  const asideRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  /* ancho / montaje */
  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [mounted, setMounted] = useState(false);

  /* apertura de secciones/menús */
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  /* empresas + selección */
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(""); // "" => BSOP sin empresa
  const [loadingCompanies, setLoadingCompanies] = useState<boolean>(false);

  /* --------------------------- ciclo de vida ancho --------------------------- */
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(LOCALSTORAGE_WIDTH_KEY);
      if (saved) {
        const w = Number(saved);
        if (!Number.isNaN(w)) setWidth(Math.min(MAX_W, Math.max(MIN_W, w)));
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LOCALSTORAGE_WIDTH_KEY, String(width));
    } catch {
      /* noop */
    }
  }, [width, mounted]);

  /* ------------------------------ empresas API ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingCompanies(true);
      try {
        // 1) lista de empresas
        const res = await fetch("/api/companies", { cache: "no-store" });
        const json = await res.json().catch(() => ({ items: [] }));
        if (!cancelled) setCompanies(Array.isArray(json.items) ? json.items : []);

        // 2) empresa actual (si el endpoint existe)
        try {
          const r2 = await fetch("/api/current-company", { cache: "no-store" });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => ({}));
            if (!cancelled && j2?.companyId) setSelectedCompanyId(j2.companyId as string);
          }
        } catch {
          /* noop */
        }
      } finally {
        if (!cancelled) setLoadingCompanies(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSelectCompany(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value; // "" => BSOP sin empresa
    setSelectedCompanyId(val);
    await fetch("/api/switch-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: val || null }),
    }).catch(() => {});
    window.location.reload(); // refresca branding y data
  }

  /* ------------------------- autoapertura según ruta ------------------------ */
  useEffect(() => {
    if (!pathname) return;
    let foundSection: string | null = null;
    let foundItem: string | null = null;

    for (const sec of NAV) {
      if (sec.items?.length) {
        for (const it of sec.items) {
          if (pathname.startsWith(it.href)) {
            foundSection = sec.key;
            foundItem = it.key;
            break;
          }
        }
      } else if (sec.href && pathname.startsWith(sec.href)) {
        foundSection = sec.key;
      }
      if (foundSection) break;
    }

    if (foundSection) setOpenSectionKey(foundSection);
    if (foundItem) setOpenMenuKey(foundItem);
  }, [pathname]);

  /* ----------------------------- drag del resizer --------------------------- */
  useEffect(() => {
    const aside = asideRef.current;
    const handle = resizerRef.current;
    if (!aside || !handle) return;

    let startX = 0;
    let startW = width;
    let dragging = false;

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
      setWidth(next);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        handle.releasePointerCapture((handle as any)._pointerId);
      } catch {}
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      (handle as any)._pointerId = e.pointerId;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {}
      startX = e.clientX ?? 0;
      startW = aside.getBoundingClientRect().width;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointerdown", onDown, { passive: true });

    return () => {
      handle.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [width]);

  /* --------------------------------- render -------------------------------- */
  const compact = width < 240;
  const sections = useMemo(() => NAV, []);

  const SectionHeader: React.FC<{
    section: Section;
    open: boolean;
    onToggle: () => void;
    isLink?: boolean;
  }> = ({ section, open, onToggle, isLink }) => {
    const content = (
      <>
        <span className="flex items-center gap-2">
          {section.icon}
          {!compact && (
            <span className="text-xs font-semibold tracking-wide">
              {section.label}
            </span>
          )}
        </span>
        {section.items?.length ? (
          open ? (
            <ChevronDown className="h-4 w-4 opacity-70" />
          ) : (
            <ChevronRight className="h-4 w-4 opacity-70" />
          )
        ) : null}
      </>
    );

    if (isLink && section.href) {
      return (
        <Link
          href={section.href}
          className={cx(
            "group flex w-full items-center justify-between rounded-lg px-3 py-2",
            "hover:bg-lime-100/70 text-slate-700"
          )}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "group flex w-full items-center justify-between rounded-lg px-3 py-2",
          "hover:bg-lime-100/70 text-slate-700"
        )}
      >
        {content}
      </button>
    );
  };

  const renderMenuItem = (it: MenuItem) => {
    const active = pathname?.startsWith(it.href);
    const content = (
      <div
        className={cx(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
          active
            ? "bg-lime-200/70 text-lime-900 font-medium"
            : "text-slate-700 hover:bg-lime-100/70"
        )}
        title={compact ? it.label : undefined}
      >
        {it.icon}
        {!compact && <span>{it.label}</span>}
      </div>
    );

    return (
      <li key={it.key}>
        <Link href={it.href} onClick={() => setOpenMenuKey(it.key)}>
          {content}
        </Link>
      </li>
    );
  };

  return (
    <aside
      ref={asideRef}
      className="relative z-20 shrink-0 border-r bg-white overflow-visible"
      style={{ width }}
    >
      {/* Resizer (2px, sobresale 1px hacia la derecha y con z alto) */}
      <div
        ref={resizerRef}
        className="absolute -right-1 top-0 h-full w-2 cursor-col-resize z-50"
        aria-hidden
      >
        <div className="h-full w-full hover:bg-slate-200/70" />
      </div>

      {/* Branding/Logo + Selector de Empresa (SIEMPRE visible) */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-10 w-10 rounded-lg bg-lime-600/10 grid place-items-center">
            <span className="text-lime-700 font-bold">D</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 leading-tight">Empresa</div>
            <div className="text-sm font-medium text-slate-800 leading-tight truncate">
              {selectedCompanyId
                ? companies.find((c) => c.id === selectedCompanyId)?.name ??
                  "Cargando…"
                : "Sin empresa (BSOP)"}
            </div>
          </div>
        </div>

        {/* Selector: ya no depende de compact */}
        <div>
          <label htmlFor="company-select" className="sr-only">
            Seleccionar empresa
          </label>
          <select
            id="company-select"
            value={selectedCompanyId}
            onChange={handleSelectCompany}
            disabled={loadingCompanies}
            className={cx(
              "w-full rounded-md border px-2 py-1.5 text-sm bg-white",
              "focus:outline-none focus:ring-2 focus:ring-lime-400"
            )}
          >
            <option value="">Sin empresa (BSOP)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Separador */}
      <div className="mx-3 mb-2 border-b" />

      {/* Secciones */}
      <nav className="px-2 pb-4">
        {useMemo(() => NAV, []).map((sec) => {
          const hasItems = !!sec.items?.length;
          const open = openSectionKey === sec.key;

          return (
            <div key={sec.key} className="mb-2">
              <SectionHeader
                section={sec}
                open={open}
                isLink={!hasItems}
                onToggle={() => {
                  if (!hasItems) return; // link directo
                  setOpenSectionKey((prev) => (prev === sec.key ? null : sec.key));
                  setOpenMenuKey(null);
                }}
              />
              {hasItems && open && (
                <ul className={cx("mt-1 space-y-1", width < 260 ? "px-1" : "px-3")}>
                  {sec.items!.map(renderMenuItem)}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
