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
  Building2,
  Users,
  Shield,
  Factory,
  Package,
  Truck,
  Wrench,
  ClipboardList,
  FileCog,
  ListChecks,
  Cog,
  ReceiptText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/* ---------------- util mínima ---------------- */
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function truthyEnv(v?: string) {
  if (!v) return false;
  const s = v.toString().trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/* lee cookie en cliente (usa "company" o "CURRENT_COMPANY_ID") */
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

/* ---------------- navegación (según doc) ---------------- */

type MenuItem = {
  key: string;
  label: string;
  href: string;
  needsCompany?: boolean;
  icon?: React.ReactNode;
  featureFlag?: string;
  enabledForCompanies?: string[];
};

type Section = {
  key: "administracion" | "operacion" | "configuracion" | "superadmin";
  label: string;
  icon?: React.ReactNode;
  items: MenuItem[];
};

const NAV_BASE: Section[] = [
  {
    key: "administracion",
    label: "ADMINISTRACIÓN",
    icon: <Building2 className="h-4 w-4" />,
    items: [
      { key: "admin-proveedores", label: "Proveedores", href: "/admin/providers", needsCompany: true, icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "admin-clientes", label: "Clientes", href: "/admin/customers", needsCompany: true, icon: <Users className="h-4 w-4" /> },
      { key: "admin-usuarios", label: "Usuarios", href: "/admin/users", needsCompany: true, icon: <Users className="h-4 w-4" /> },
      { key: "admin-sucursales", label: "Sucursales", href: "/admin/branches", needsCompany: true, icon: <Building2 className="h-4 w-4" /> },
      { key: "admin-roles", label: "Roles y Permisos", href: "/admin/roles", needsCompany: true, icon: <Shield className="h-4 w-4" /> },
      { key: "admin-empresa", label: "Empresa", href: "/admin/company", needsCompany: true, icon: <Building2 className="h-4 w-4" /> },
      { key: "admin-datos-fiscales", label: "Datos Fiscales", href: "/admin/legal", needsCompany: true, icon: <ReceiptText className="h-4 w-4" /> },
      { key: "admin-branding", label: "Branding", href: "/admin/branding", needsCompany: true, icon: <Settings className="h-4 w-4" /> },
    ],
  },
  {
    key: "operacion",
    label: "OPERACIÓN",
    icon: <Factory className="h-4 w-4" />,
    items: [
      { key: "op-compras", label: "Compras", href: "/purchases", needsCompany: true, icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "op-recepciones", label: "Recepciones", href: "/purchases/receiving", needsCompany: true, icon: <Truck className="h-4 w-4" /> },
      { key: "op-oc", label: "Ordenes de Compra", href: "/purchases/po", needsCompany: true, icon: <ClipboardList className="h-4 w-4" /> },
      { key: "op-inventario", label: "Inventario", href: "/inventory", needsCompany: true, icon: <Boxes className="h-4 w-4" /> },
      { key: "op-movimientos", label: "Movimientos", href: "/inventory/moves", needsCompany: true, icon: <Package className="h-4 w-4" /> },
      { key: "op-ventas", label: "Ventas", href: "/sales", needsCompany: true, icon: <HandCoins className="h-4 w-4" /> },
      { key: "op-caja", label: "Caja", href: "/cash", needsCompany: true, icon: <Wallet className="h-4 w-4" /> },
      { key: "op-mov-caja", label: "Movimientos de Caja", href: "/cash/movements", needsCompany: true, icon: <Wallet className="h-4 w-4" /> },
      { key: "op-reportes", label: "Reportes", href: "/reports", needsCompany: true, icon: <FileChartColumn className="h-4 w-4" /> },
      { key: "op-mantenimiento", label: "Mantenimiento", href: "/maintenance", needsCompany: true, icon: <Wrench className="h-4 w-4" /> },
    ],
  },
  {
    key: "configuracion",
    label: "CONFIGURACIÓN",
    icon: <Settings className="h-4 w-4" />,
    items: [
      { key: "cfg-catalogos", label: "Catálogos", href: "/settings/catalogs", needsCompany: true, icon: <FileCog className="h-4 w-4" /> },
      { key: "cfg-workflows", label: "Workflows", href: "/settings/workflows", needsCompany: true, icon: <ListChecks className="h-4 w-4" /> },
      { key: "cfg-sistema", label: "Sistema", href: "/settings/system", needsCompany: true, icon: <Cog className="h-4 w-4" /> },
    ],
  },
  {
    key: "superadmin",
    label: "SUPERADMIN",
    icon: <Building2 className="h-4 w-4" />,
    items: [
      { key: "sa-companies", label: "Empresas", href: "/superadmin/companies", icon: <Building2 className="h-4 w-4" /> },
      { key: "sa-users", label: "Usuarios", href: "/superadmin/users", icon: <Users className="h-4 w-4" /> },
    ],
  },
];

/* feature flags por entorno */
const FF_SALE = truthyEnv(process.env.NEXT_PUBLIC_FF_SALE);
const FF_CASH = truthyEnv(process.env.NEXT_PUBLIC_FF_CASH);
const FF_MAINTENANCE = truthyEnv(process.env.NEXT_PUBLIC_FF_MAINTENANCE);

/* aplica flags a la navegación base */
function buildNav(companyId: string | null): Section[] {
  const can = (it: MenuItem) => {
    if (it.needsCompany && !companyId) return false;
    if (it.featureFlag && !truthyEnv(process.env[`NEXT_PUBLIC_${it.featureFlag}` as any])) return false;
    return true;
  };
  const clone: Section[] = NAV_BASE.map((s) => ({
    ...s,
    items: s.items.filter(can),
  }));
  // ejemplo de flags puntuales
  if (!FF_SALE) {
    const op = clone.find((s) => s.key === "operacion");
    if (op) op.items = op.items.filter((x) => x.key !== "op-ventas");
  }
  if (!FF_CASH) {
    const op = clone.find((s) => s.key === "operacion");
    if (op) op.items = op.items.filter((x) => x.key !== "op-caja" && x.key !== "op-mov-caja");
  }
  if (!FF_MAINTENANCE) {
    const op = clone.find((s) => s.key === "operacion");
    if (op) op.items = op.items.filter((x) => x.key !== "op-mantenimiento");
  }
  return clone;
}

function SectionHeader({
  open,
  onToggle,
  icon,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
    >
      <span className="grid place-items-center">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
      {icon ? <span className="grid place-items-center">{icon}</span> : null}
      <span className="tracking-wide">{children}</span>
    </button>
  );
}

function NavLink({
  href,
  active,
  children,
  icon,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        active
          ? "bg-[color:var(--brand-50)] text-[color:var(--brand-900)]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

export default function Sidebar({ width = 260 }: { width?: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [open, setOpen] = useState<Record<string, boolean>>({
    administracion: true,
    operacion: true,
    configuracion: true,
    superadmin: true,
  });

  const companyId = useMemo(() => readCompanyCookie(), []);

  // reconstruye navegación en base a companyId y flags
  const sections = useMemo(() => buildNav(companyId), [companyId]);

  function toggle(k: string) {
    setOpen((p) => ({ ...p, [k]: !p[k] }));
  }

  function isActive(href: string) {
    if (href === "/dashboard" && (pathname === "/" || pathname === "/dashboard")) return true;
    return pathname?.startsWith(href);
  }

  function Item(it: MenuItem) {
    return (
      <NavLink href={it.href} active={isActive(it.href)} icon={it.icon}>
        {it.label}
      </NavLink>
    );
  }

  return (
    <aside className="shrink-0 border-r bg-white" style={{ width }}>
      {/* Header simple */}
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

      {/* Navegación */}
      <nav className="px-2 pb-4">
        {/* ADMINISTRACIÓN */}
        <div className="mb-2">
          <SectionHeader
            open={!!open.administracion}
            onToggle={() => toggle("administracion")}
            icon={<LayoutDashboard className="h-4 w-4" />}
          >
            ADMINISTRACIÓN
          </SectionHeader>
          {open.administracion && (
            <div className="pl-6 space-y-0.5">
              {sections
                .find((s) => s.key === "administracion")
                ?.items.map((it) => <div key={it.key}>{Item(it)}</div>)}
            </div>
          )}
        </div>

        {/* OPERACIÓN */}
        <div className="mb-2">
          <SectionHeader
            open={!!open.operacion}
            onToggle={() => toggle("operacion")}
            icon={<Factory className="h-4 w-4" />}
          >
            OPERACIÓN
          </SectionHeader>
        {open.operacion && (
            <div className="pl-6 space-y-0.5">
              {sections
                .find((s) => s.key === "operacion")
                ?.items.map((it) => <div key={it.key}>{Item(it)}</div>)}
            </div>
          )}
        </div>

        {/* CONFIGURACIÓN */}
        <div className="mb-2">
          <SectionHeader
            open={!!open.configuracion}
            onToggle={() => toggle("configuracion")}
            icon={<Settings className="h-4 w-4" />}
          >
            CONFIGURACIÓN
          </SectionHeader>
          {open.configuracion && (
            <div className="pl-6 space-y-0.5">
              {sections
                .find((s) => s.key === "configuracion")
                ?.items.map((it) => <div key={it.key}>{Item(it)}</div>)}
            </div>
          )}
        </div>

        {/* SUPERADMIN */}
        <div className="mb-2">
          <SectionHeader
            open={!!open.superadmin}
            onToggle={() => toggle("superadmin")}
            icon={<Building2 className="h-4 w-4" />}
          >
            SUPERADMIN
          </SectionHeader>
          {open.superadmin && (
            <div className="pl-6 space-y-0.5">
              {sections
                .find((s) => s.key === "superadmin")
                ?.items.map((it) => <div key={it.key}>{Item(it)}</div>)}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
