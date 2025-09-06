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

/**
 * Util: clsx simple para clases condicionales
 */
function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ");
}

/**
 * Estructura de navegación (ajústala si agregas más rutas)
 */
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

const LOCALSTORAGE_WIDTH_KEY = "sidebarWidth";
const MIN_W = 220;
const MAX_W = 420;
const DEFAULT_W = 260;

export default function Sidebar() {
  const pathname = usePathname();
  const asideRef = useRef<HTMLDivElement | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  const [width, setWidth] = useState<number>(DEFAULT_W);
  const [mounted, setMounted] = useState(false);

  // Estado: solo una sección abierta y un menú abierto
  const [openSectionKey, setOpenSectionKey] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  // Cargar ancho desde localStorage
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

  // Persistir ancho
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(LOCALSTORAGE_WIDTH_KEY, String(width));
    } catch {
      /* noop */
    }
  }, [width, mounted]);

  // Autoabrir la sección y el item según la ruta
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

  // Drag para el resizer
  useEffect(() => {
    const aside = asideRef.current;
    const handle = resizerRef.current;
    if (!aside || !handle) return;

    let startX = 0;
    let startW = width;
    let dragging = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const delta = e.clientX - startX;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
      setWidth(next);
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      dragging = true;
      startX = e.clientX;
      startW = aside.getBoundingClientRect().width;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    const onDbl = () => setWidth(DEFAULT_W);

    handle.addEventListener("mousedown", onMouseDown);
    handle.addEventListener("dblclick", onDbl);

    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      handle.removeEventListener("dblclick", onDbl);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [width]);

  const compact = width < 240;

  // Empresa (muestra un nombre por defecto; adapta a tu store si ya lo tienes)
  const companyName =
    (typeof window !== "undefined" &&
      (localStorage.getItem("currentCompanyName") ||
        "Desarrollo Inmobiliario los Encinos SA de CV")) ||
    "Desarrollo Inmobiliario los Encinos SA de CV";

  const companyShort =
    companyName.length > 28 ? companyName.slice(0, 28) + "…" : companyName;

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
          {!compact && <span className="text-xs font-semibold tracking-wide">{section.label}</span>}
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

  const sections = useMemo(() => NAV, []);

  return (
    <aside
      ref={asideRef}
      className="relative shrink-0 border-r bg-white"
      style={{ width }}
    >
      {/* Resizer */}
      <div
        ref={resizerRef}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-slate-200"
        aria-hidden
      />

      {/* Header de empresa / branding */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-lime-600/10 grid place-items-center">
            <span className="text-lime-700 font-bold">D</span>
          </div>
          {!compact && (
            <div className="min-w-0">
              <div className="text-xs text-slate-500 leading-tight">Empresa</div>
              <div className="text-sm font-medium text-slate-800 leading-tight truncate">
                {companyShort}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Separador */}
      <div className="mx-3 mb-2 border-b" />

      {/* Secciones */}
      <nav className="px-2 pb-4">
        {sections.map((sec) => {
          const hasItems = !!sec.items?.length;
          const open = openSectionKey === sec.key;

          return (
            <div key={sec.key} className="mb-2">
              <SectionHeader
                section={sec}
                open={open}
                isLink={!hasItems}
                onToggle={() => {
                  if (!hasItems) {
                    // Si no tiene items, es link; no tocamos openSectionKey
                    return;
                  }
                  setOpenSectionKey((prev) => (prev === sec.key ? null : sec.key));
                  // al abrir una sección, colapsamos otras y limpiamos openMenuKey
                  setOpenMenuKey(null);
                }}
              />

              {hasItems && open && (
                <ul className={cx("mt-1 space-y-1", compact ? "px-1" : "px-3")}>
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
