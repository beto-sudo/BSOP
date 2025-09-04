'use client';

import { ReactNode } from "react";
import {
  ShoppingCart, Boxes, FileText, Settings, Users, Shield, Link as LinkIcon, Home
} from "lucide-react";

/** Tipos */
export type NavItem = {
  label: string;
  href: string;
  needsCompany?: boolean;
  enabled?: boolean;
  enabledForCompanies?: string[]; // slugs lowercase
  enabledByFeature?: string;      // p.ej. "waitry", "cfdi"
};

export type NavMenu = {
  key: string;
  label: string;
  icon?: ReactNode;
  items: NavItem[];
};

export type Section = {
  key: string;
  label: string;
  menus: NavMenu[];
};

/** Helpers de construcción */
const i = (
  label: string,
  href: string,
  needsCompany = true,
  enabled = true,
  extra?: Partial<NavItem>
): NavItem => ({ label, href, needsCompany, enabled, ...(extra || {}) });

const m = (key: string, label: string, icon: ReactNode, items: NavItem[]): NavMenu => ({ key, label, icon, items });

/* =========================
   1) ADMINISTRACIÓN (1°)
   ========================= */
export const ADMINISTRACION: Section = {
  key: "administracion",
  label: "ADMINISTRACIÓN",
  menus: [
    m("proveedores", "Proveedores", <FileText className="h-4 w-4" />, [
      i("Listado", "/admin/vendors"),
    ]),
    m("clientes", "Clientes", <FileText className="h-4 w-4" />, [
      i("Listado", "/admin/customers"),
    ]),
    m("tesoreria", "Tesorería", <FileText className="h-4 w-4" />, [
      i("Bancos", "/admin/treasury/banks"),
      i("Conciliaciones", "/admin/treasury/reconciliations"),
    ]),
    m("cxp", "Cuentas por pagar (CxP)", <FileText className="h-4 w-4" />, [
      i("Antigüedad", "/admin/ap/aging"),
      i("Facturas/Órdenes", "/admin/ap/invoices"),
    ]),
    m("cxc", "Cuentas por cobrar (CxC)", <FileText className="h-4 w-4" />, [
      i("Antigüedad", "/admin/ar/aging"),
      i("Cobranza", "/admin/ar/collections"),
    ]),
    m("presupuestos", "Presupuestos", <FileText className="h-4 w-4" />, [
      i("Planeación", "/admin/budgeting"),
    ]),
    m("activos", "Activos fijos", <FileText className="h-4 w-4" />, [
      i("Maestro de activos", "/admin/fixed-assets"),
    ]),
    m("contabilidad", "Contabilidad", <FileText className="h-4 w-4" />, [
      i("Catálogo de cuentas", "/admin/accounting/chart"),
      i("Pólizas", "/admin/accounting/entries"),
      i("Balanza/Auxiliares", "/admin/accounting/trials"),
    ]),
    m("rh", "Recursos Humanos", <Users className="h-4 w-4" />, [
      i("Empleados", "/admin/hr/employees"),
      i("Nóminas", "/admin/hr/payroll", true, true, { enabledByFeature: "payroll" }),
      i("Asistencias", "/admin/hr/attendance", true, true, { enabledByFeature: "attendance" }),
    ]),
  ],
};

/* =========================
   2) OPERACIÓN (2°)
   ========================= */
export const OPERACION: Section = {
  key: "operacion",
  label: "OPERACIÓN",
  menus: [
    m("inicio", "Inicio (KPIs)", <Home className="h-4 w-4" />, [
      i("Dashboard", "/", true),
    ]),
    m("compras", "Compras", <ShoppingCart className="h-4 w-4" />, [
      i("Requisiciones", "/purchases/requests"),
      i("Órdenes de compra", "/purchases/po"),
      i("Recepciones", "/purchases/receiving"),
      i("Devoluciones", "/purchases/returns"),
    ]),
    m("inventario", "Inventario", <Boxes className="h-4 w-4" />, [
      i("Productos", "/inventory/products"),
      i("Almacenes", "/inventory/warehouses"),
      i("Transferencias", "/inventory/transfers"),
      i("Conteos físicos", "/inventory/counts"),
      i("Ajustes", "/inventory/adjustments"),
    ]),
    m("ventas", "Ventas", <FileText className="h-4 w-4" />, [
      i("Pedidos (Waitry)", "/sales/orders", true, true, { enabledByFeature: "waitry" }),
      i("Tickets", "/sales/tickets"),
      i("Facturación", "/sales/invoicing"),
    ]),
    m("caja", "Caja", <FileText className="h-4 w-4" />, [
      i("Aperturas y cierres", "/cash/closures"),
      i("Movimientos", "/cash/movements"),
    ]),
    m("reportes", "Reportes", <FileText className="h-4 w-4" />, [
      i("Operación", "/reports"),
    ]),
  ],
};

/* =========================
   3) CONFIGURACIÓN (3°)
   ========================= */
export const CONFIGURACION: Section = {
  key: "configuracion",
  label: "CONFIGURACIÓN",
  menus: [
    m("empresa", "Empresa", <Settings className="h-4 w-4" />, [
      i("Branding", "/admin/branding"),
      i("Datos fiscales", "/admin/legal"),
      i("Datos generales", "/admin/company"),
    ]),
    m("accesos", "Accesos (empresa)", <Shield className="h-4 w-4" />, [
      i("Usuarios", "/settings/users", false),
      i("Roles", "/settings/roles", false),
    ]),
    m("integraciones", "Integraciones (empresa)", <LinkIcon className="h-4 w-4" />, [
      i("Waitry", "/settings/integrations/waitry", true, true, { enabledByFeature: "waitry" }),
      i("CFDI/Timbrado", "/settings/integrations/cfdi", true, true, { enabledByFeature: "cfdi" }),
      i("Bancos", "/settings/integrations/banks", true, true, { enabledByFeature: "banks" }),
      i("WhatsApp", "/settings/integrations/whatsapp", true, true, { enabledByFeature: "whatsapp" }),
      i("Email (SMTP)", "/settings/integrations/email", true, true, { enabledByFeature: "smtp" }),
      i("Almacenamiento (S3)", "/settings/integrations/storage", true, true, { enabledByFeature: "storage" }),
      i("Webhooks", "/settings/integrations/webhooks", true, true, { enabledByFeature: "webhooks" }),
    ]),
  ],
};

/* =========================
   4) SUPERADMIN (4°)
   ========================= */
export const SUPERADMIN: Section = {
  key: "superadmin",
  label: "SUPERADMIN",
  menus: [
    m("panel", "Panel Superadmin", <Shield className="h-4 w-4" />, [
      i("Panel", "/settings/admin", false),
    ]),
    m("accesosGlobal", "Accesos globales", <Shield className="h-4 w-4" />, [
      i("Accesos", "/settings/access", false),
    ]),
    m("empresas", "Empresas", <Boxes className="h-4 w-4" />, [
      i("Listado", "/companies", false),
    ]),
    m("integracionesGlobal", "Integraciones (global)", <LinkIcon className="h-4 w-4" />, [
      i("Catálogo/Proveedores", "/settings/integrations/global", false),
    ]),
  ],
};

/** Orden fijo. SUPERADMIN sólo si isSuperadmin = true */
export function buildSectionsOrdered(isSuperadmin: boolean): Section[] {
  const base: Section[] = [ADMINISTRACION, OPERACION, CONFIGURACION];
  return isSuperadmin ? [...base, SUPERADMIN] : base;
}
