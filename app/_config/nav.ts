// app/_config/nav.ts
import { ReactNode } from "react";
import { ShoppingCart, Boxes, FileText, Settings, Users, Shield } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  needsCompany?: boolean; // si true, Sidebar agrega ?company=<slug>
};

export type Section = { key: string; label: string; items: NavItem[] };

const OPERACION: Section = {
  key: "operacion",
  label: "OPERACIÓN",
  items: [
    { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
    { label: "Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
    { label: "Inventario", href: "/inventory", icon: <Boxes className="h-4 w-4" />, needsCompany: true },
    { label: "Reportes", href: "/reports", icon: <FileText className="h-4 w-4" />, needsCompany: true },
  ],
};

const CONFIG: Section = {
  key: "config",
  label: "CONFIGURACIÓN",
  items: [
    { label: "Empresa (Branding)", href: "/admin/branding", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Datos Fiscales", href: "/admin/legal", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Datos Generales", href: "/admin/company", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Usuarios", href: "/settings/users", icon: <Users className="h-4 w-4" /> },
    { label: "Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" /> },
  ],
};

const ADMIN: Section = {
  key: "superadmin",
  label: "ADMINISTRACIÓN",
  items: [
    { label: "Panel Superadmin", href: "/settings/admin", icon: <Shield className="h-4 w-4" /> },
    { label: "Accesos", href: "/settings/access", icon: <Shield className="h-4 w-4" /> },
    { label: "Empresas", href: "/companies", icon: <Boxes className="h-4 w-4" /> }, // ← SIEMPRE AQUÍ
  ],
};

export function buildSections(isSuperadmin: boolean): Section[] {
  return isSuperadmin ? [OPERACION, CONFIG, ADMIN] : [OPERACION, CONFIG];
}
