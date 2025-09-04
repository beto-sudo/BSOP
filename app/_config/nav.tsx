'use client';

import { ReactNode } from "react";
import { ShoppingCart, Boxes, FileText, Settings, Users, Shield } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Si true, el Sidebar agregará ?company=<slug> a la URL */
  needsCompany?: boolean;
};

export type Section = { key: string; label: string; items: NavItem[] };

/** 1) OPERACIÓN: módulos que requieren contexto de empresa */
export const OPERACION: Section = {
  key: "operacion",
  label: "OPERACIÓN",
  items: [
    { label: "Órdenes de Compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
    { label: "Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true },
    { label: "Inventario", href: "/inventory", icon: <Boxes className="h-4 w-4" />, needsCompany: true },
    { label: "Reportes", href: "/reports", icon: <FileText className="h-4 w-4" />, needsCompany: true },
  ],
};

/** 2) ADMINISTRACIÓN (operativa/contable) — agrega aquí tus rutas cuando estén listas */
export const ADMINISTRACION: Section = {
  key: "administracion",
  label: "ADMINISTRACIÓN",
  items: [
    // Ejemplos futuros:
    // { label: "Contabilidad", href: "/admin/accounting", icon: <FileText className="h-4 w-4" />, needsCompany: true },
    // { label: "Recursos Humanos", href: "/admin/hr", icon: <Users className="h-4 w-4" />, needsCompany: true },
  ],
};

/** 3) CONFIGURACIÓN: datos y accesos por compañía */
export const CONFIGURACION: Section = {
  key: "configuracion",
  label: "CONFIGURACIÓN",
  items: [
    { label: "Empresa (Branding)", href: "/admin/branding", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Datos Fiscales", href: "/admin/legal", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Datos Generales", href: "/admin/company", icon: <Settings className="h-4 w-4" />, needsCompany: true },
    { label: "Usuarios", href: "/settings/users", icon: <Users className="h-4 w-4" /> },
    { label: "Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" /> },
  ],
};

/** 4) SUPERADMIN: solo visible a superadmins; NO requiere company */
export const SUPERADMIN: Section = {
  key: "superadmin",
  label: "SUPERADMIN",
  items: [
    { label: "Panel Superadmin", href: "/settings/admin", icon: <Shield className="h-4 w-4" /> },
    { label: "Accesos", href: "/settings/access", icon: <Shield className="h-4 w-4" /> },
    { label: "Empresas", href: "/companies", icon: <Boxes className="h-4 w-4" /> },
  ],
};

/** Orden fijo de grupos. SUPERADMIN solo si isSuperadmin = true */
export function buildSectionsOrdered(isSuperadmin: boolean): Section[] {
  const base: Section[] = [OPERACION, ADMINISTRACION, CONFIGURACION];
  return isSuperadmin ? [...base, SUPERADMIN] : base;
}
