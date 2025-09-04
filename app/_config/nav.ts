// app/_config/nav.ts
import { ReactNode } from "react";
import { ShoppingCart, Boxes, FileText, Settings, Users, Shield } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  /** si true, el Sidebar agregará ?company=<slug> a la URL */
  needsCompany?: boolean;
};

export type Section = { key: string; label: string; items: NavItem[] };

/** OPERACIÓN: módulos que requieren contexto de empresa */
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

/** ADMINISTRACIÓN (operativa/contable): dejamos preparada la sección para tus módulos.
 *  IMPORTANTE: agrega aquí las rutas reales cuando estén listas para evitar 404s.
 *  Por ahora la dejamos vacía para no romper navegación.
 */
export const ADMINISTRACION: Section = {
  key: "administracion",
  label: "ADMINISTRACIÓN",
  items: [
    // Ejemplos cuando los módulos estén listos:
    // { label: "Contabilidad", href: "/admin/accounting", icon: <FileText className="h-4 w-4" />, needsCompany: true },
    // { label: "Recursos Humanos", href: "/admin/hr", icon: <Users className="h-4 w-4" />, needsCompany: true },
  ],
};

/** CONFIGURACIÓN: datos de la empresa y control de acceso por compañía */
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

/** SUPERADMIN: solo visible a superadmins; NO requiere company */
export const SUPERADMIN: Section = {
  key: "superadmin",
  label: "SUPERADMIN",
  items: [
    { label: "Panel Superadmin", href: "/settings/admin", icon: <Shield className="h-4 w-4" /> },
    { label: "Accesos", href: "/settings/access", icon: <Shield className="h-4 w-4" /> },
    { label: "Empresas", href: "/companies", icon: <Boxes className="h-4 w-4" /> },
  ],
};

/** Construye el menú en orden fijo. SUPERADMIN solo si isSuperadmin = true */
export function buildSectionsOrdered(isSuperadmin: boolean): Section[] {
  const base: Section[] = [OPERACION, ADMINISTRACION, CONFIGURACION];
  return isSuperadmin ? [...base, SUPERADMIN] : base;
}
