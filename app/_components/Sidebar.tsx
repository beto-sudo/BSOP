// app/_components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
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
  Users,
  UserCog,
  Landmark,
  ReceiptText,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/* util mínima */
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/* lee cookie en cliente (usamos "company" si existe; fallback a "CURRENT_COMPANY_ID") */
function readCompanyCookie(): string | null {
  if (typeof document === "undefined") return null;
  const map = Object.fromEntries(
    document.cookie.split(";").map((p) => {
      const [k, ...r] = p.trim().split("=");
      return [decodeURIComponent(k), decodeURIComponent(r.join("=") || "")];
    })
  );
  return map.company || map.CURRENT_COMPANY_ID || null;
}

/* ==================== ÁRBOL EXACTO DEL DOCUMENTO ==================== */

type MenuItem = {
  key: string;
  label: string;
  href: string;         // ruta base (sin company)
  needsCompany?: boolean;
  icon?: React.ReactNode;
  featureFlag?: string;            // enabledByFeature
  enabledForCompanies?: string[];  // enabledForCompanies
};

type Section = {
  key: "administracion" | "operacion" | "configuracion" | "superadmin";
  label: string;
  icon?: React.ReactNode;
  items: MenuItem[];
};

const NAV_BASE: Section[] = [
  /* ------------------ ADMINISTRACIÓN ------------------ */
  {
    key: "administracion",
    label: "ADMINISTRACIÓN",
    icon: <Building2 className="h-4 w-4" />,
    items: [
      { key: "admin-proveedores", label: "Proveedores", href: "/admin/vendors", needsCompany: true, icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "admin-clientes", label: "Clientes", href: "/admin/customers", needsCompany: true, icon: <Users className="h-4 w-4" /> },
      { key: "admin-integraciones", label: "Integraciones", href: "/admin/integrations", needsCompany: true, icon: <Settings className="h-4 w-4" /> },
      { key: "admin-finanzas", label: "Finanzas", href: "/admin/finances", needsCompany: true, icon: <Landmark className="h-4 w-4" /> },
    ],
  },

  /* -------------------- OPERACIÓN --------------------- */
  {
    key: "operacion",
    label: "OPERACIÓN",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      // Inicio (KPIs)
      { key: "op-dashboard", label: "Dashboard", href: "/dashboard", needsCompany: true, icon: <LayoutDashboard className="h-4 w-4" /> },

      // Compras
      { key: "op-po", label: "Órdenes de compra", href: "/purchases/po", needsCompany: true, icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "op-recepciones", label: "Recepciones", href: "/purchases/receiving", needsCompany: true, icon: <ReceiptText className="h-4 w-4" /> },

      // Inventario
      { key: "op-inventario", label: "Inventario", href: "/inventory", needsCompany: true, icon: <Boxes className="h-4 w-4" /> },

      // Ventas
      { key: "op-ventas", label: "Ventas", href: "/sales", needsCompany: true, icon: <HandCoins className="h-4 w-4" /> },

      // Caja
      { key: "op-caja", label: "Caja", href: "/cash", needsCompany: true, icon: <Wallet className="h-4 w-4" /> },

      // Reportes
      { key: "op-reportes", label: "Reportes", href: "/reports", needsCompany: true, icon: <FileChartColumn className="h-4 w-4" /> },
    ],
  },

  /* ------------------- CONFIGURACIÓN ------------------ */
  {
    key: "configuracion",
    label: "CONFIGURACIÓN",
    icon: <Settings className="h-4 w-4" />,
    items: [
      // Empresa (Branding)
      { key: "cfg-branding", label: "Branding", href: "/admin/branding", needsCompany: true, icon: <Settings className="h-4 w-4" /> },

      // Datos Fiscales
      { key: "cfg-tax", label: "Datos Fiscales", href: "/settings/tax", needsCompany: true, icon: <ReceiptText className="h-4 w-4" /> },

      // Datos Generales
      { key: "cfg-general", label: "Datos Generales", href: "/settings/general", needsCompany: true, icon: <Settings className="h-4 w-4" /> },

      // Usuarios
      { key: "cfg-users", label: "Usuarios", href: "/settings/users", needsCompany: true, icon: <Users className="h-4 w-4" /> },

      // Roles
      { key: "cfg-roles", label: "Roles", href: "/settings/roles", needsCompany: true, icon: <UserCog className="h-4 w-4" /> },
    ],
  },
];

/* SUPERADMIN se inyecta al final sólo si flag = 1 */
const SUPERADMIN_SECTION: Section = {
  key: "superadmin",
  label: "SUPERADMIN",
  icon: <Shield className="h-4 w-4" />,
  items: [
    { key: "sa-companies", label: "Empresas", href: "/companies", needsCompany: false, icon: <Building2 className="h-4 w-4" /> },
    { key: "sa-access", label: "Accesos", href: "/settings/access", needsCompany: false, icon: <Shield className="h-4 w-4" /> },
  ],
};

/* ==================== COMPONENTE ==================== */

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const search = useSearchParams();
  const router = useRouter();

  const [openSectionKey, setOpenSectionKey] = useState<Section["key"] | null>("operacion"); // abre Operación por defecto
  const [openItemKey, setOpenItemKey] = useState<string | null>(null);

  const isSuperadmin = process.env.NEXT_PUBLIC_IS_SUPERADMIN === "1";

  /* nav final respetando el orden del documento */
  const NAV: Section[] = useMemo(
    () => (isSuperadmin ? [...NAV_BASE, SUPERADMIN_SECTION] : NAV_BASE),
    [isSuperadmin]
  );

  /* === Guardas suaves de ?company (sin bucles) ===
     - Solo en items con needsCompany
     - Si falta ?company y existe cookie "company"/"CURRENT_COMPANY_ID", agregamos una única vez
  */
  const ensuredOnce = useRef(false);
  useEffect(() => {
    if (ensuredOnce.current) return;

    const hasCompanyParam = !!search?.get("company");
    if (hasCompanyParam) return;

    const companyId = readCompanyCookie();
    if (!companyId) return;

    // ¿ruta actual requiere company?
    const requiresCompany = NAV.some((sec) =>
      sec.items.some((it) => it.needsCompany && pathname.startsWith(it.href))
    );
    if (!requiresCompany) return;

    ensuredOnce.current = true;
    const url = new URL(window.location.href);
    url.searchParams.set("company", companyId);
    router.replace(url.toString());
  }, [pathname, search, router, NAV]);

  /* detecta item activo y autoabre sección */
  useEffect(() => {
    for (const sec of NAV) {
      for (const it of sec.items) {
        if (pathname.startsWith(it.href)) {
          setOpenSectionKey(sec.key);
          setOpenItemKey(it.key);
          return;
        }
      }
    }
  }, [pathname, NAV]);

  /* compone href (inyecta ?company si el item lo necesita y hay cookie) */
  function makeHref(it: MenuItem): string {
    let url = it.href;
    if (it.needsCompany) {
      const cid = search?.get("company") || readCompanyCookie();
      if (cid) {
        const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
        u.searchParams.set("company", cid);
        url = u.pathname + "?" + u.searchParams.toString();
      }
    }
    return url;
  }

  /* estilos de grupo/ítem con CSS vars del branding */
  function SectionHeader({
    section,
    open,
    onToggle,
  }: {
    section: Section;
    open: boolean;
    onToggle: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          "group flex w-full items-center justify-between rounded-md px-3 py-2 text-left",
          "border-l-4",
          open ? "border-[var(--brand-primary)]" : "border-transparent",
          "bg-[var(--brand-50)] text-[color:var(--brand-900)]"
        )}
      >
        <span className="flex items-center gap-2">
          {section.icon}
          <span className="text-xs font-semibold tracking-wide">{section.label}</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 opacity-70" />
        ) : (
          <ChevronRight className="h-4 w-4 opacity-70" />
        )}
      </button>
    );
  }

  function MenuLink({ it }: { it: MenuItem }) {
    const active = pathname.startsWith(it.href);
    return (
      <Link
        href={makeHref(it)}
        onClick={() => setOpenItemKey(it.key)}
        className={cx(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
          active
            ? "bg-[var(--brand-50)] text-[color:var(--brand-800)] border-l-4 border-[var(--brand-primary)]"
            : "text-slate-700 hover:bg-[var(--brand-100)] hover:text-[color:var(--brand-900)]"
        )}
      >
        {it.icon}
        <span>{it.label}</span>
      </Link>
    );
  }

  return (
    <aside className="shrink-0 border-r bg-white" style={{ width: 260 }}>
      {/* Header / Branding simple */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-[color:var(--brand-50)] grid place-items-center border">
            <span className="text-[color:var(--brand-900)] font-bold">BS</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 leading-tight">BSOP</div>
            <div className="text-sm font-medium text-slate-800 leading-tight truncate">
              Selecciona un módulo
            </div>
          </div>
        </div>
      </div>

      <div className="mx-3 mb-2 border-b" />

      <nav className="px-2 pb-4">
        {NAV.map((sec) => {
          const open = openSectionKey === sec.key;
          return (
            <div key={sec.key} className="mb-2">
              <SectionHeader
                section={sec}
                open={!!open}
                onToggle={() =>
                  setOpenSectionKey((prev) => (prev === sec.key ? null : sec.key))
                }
              />
              {open && (
                <ul className="mt-1 space-y-1 px-3">
                  {sec.items.map((it) => (
                    <li key={it.key}>
                      <MenuLink it={it} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
