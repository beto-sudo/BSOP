'use client';

import { ReactNode } from "react";
import { ShoppingCart, Boxes, FileText, Settings, Users, Shield, Link as LinkIcon } from "lucide-react";

/**
 * Reglas:
 * - needsCompany: si true, el Sidebar agrega ?company=<slug> a la URL.
 * - enabled: si false, el ítem no se muestra (evitamos 404s en módulos no listos).
 * - enabledForCompanies: restringe por slugs de empresa (lowercase). Si está presente, solo se muestra para esos slugs.
 * - enabledByFeature: llave de feature flag (se evalúa contra settings.features[clave] de la compañía).
 */

export type NavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  needsCompany?: boolean;
  enabled?: boolean;
  enabledForCompanies?: string[]; // e.g., ["ansa","dilesa"]
  enabledByFeature?: string;      // e.g., "waitry", "cfdi"
};

export type Section = { key: string; label: string; items: NavItem[] };

/* =========================
   1) ADMINISTRACIÓN (1°)
   ========================= */
export const ADMINISTRACION: Section = {
  key: "administracion",
  label: "ADMINISTRACIÓN",
  items: [
    // Contabilidad / Tesorería / RH (por ahora en propuesta → enabled: false)
    { label: "Proveedores", href: "/admin/vendors", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Clientes", href: "/admin/customers", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Tesorería — Bancos", href: "/admin/treasury/banks", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Tesorería — Conciliaciones", href: "/admin/treasury/reconciliations", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "CxP — Antigüedad", href: "/admin/ap/aging", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "CxP — Facturas/Órdenes", href: "/admin/ap/invoices", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "CxC — Antigüedad", href: "/admin/ar/aging", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "CxC — Cobranza", href: "/admin/ar/collections", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Presupuestos", href: "/admin/budgeting", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Activos fijos", href: "/admin/fixed-assets", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Contabilidad — Catálogo", href: "/admin/accounting/chart", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Contabilidad — Pólizas", href: "/admin/accounting/entries", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Contabilidad — Balanza/Aux", href: "/admin/accounting/trials", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "RH — Empleados", href: "/admin/hr/employees", icon: <Users className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "RH — Nóminas", href: "/admin/hr/payroll", icon: <Users className="h-4 w-4" />, needsCompany: true, enabled: false, enabledForCompanies: [], enabledByFeature: "payroll" },
    { label: "RH — Asistencias", href: "/admin/hr/attendance", icon: <Users className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "attendance" },
  ],
};

/* =========================
   2) OPERACIÓN (2°)
   ========================= */
export const OPERACION: Section = {
  key: "operacion",
  label: "OPERACIÓN",
  items: [
    { label: "Inicio (KPIs)", href: "/", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Compras — Requisiciones", href: "/purchases/requests", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Compras — Órdenes de compra", href: "/purchases/po", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true, enabled: true },
    { label: "Compras — Recepciones", href: "/purchases/receiving", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true, enabled: true },
    { label: "Compras — Devoluciones", href: "/purchases/returns", icon: <ShoppingCart className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Inventario — Productos", href: "/inventory/products", icon: <Boxes className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Inventario — Almacenes", href: "/inventory/warehouses", icon: <Boxes className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Inventario — Transferencias", href: "/inventory/transfers", icon: <Boxes className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Inventario — Conteos físicos", href: "/inventory/counts", icon: <Boxes className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Inventario — Ajustes", href: "/inventory/adjustments", icon: <Boxes className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Ventas — Pedidos (Waitry)", href: "/sales/orders", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "waitry" },
    { label: "Ventas — Tickets", href: "/sales/tickets", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Ventas — Facturación", href: "/sales/invoicing", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Caja — Aperturas y cierres", href: "/cash/closures", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Caja — Movimientos", href: "/cash/movements", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: false },
    { label: "Reportes — Operación", href: "/reports", icon: <FileText className="h-4 w-4" />, needsCompany: true, enabled: true },
  ],
};

/* =========================
   3) CONFIGURACIÓN (3°)
   ========================= */
export const CONFIGURACION: Section = {
  key: "configuracion",
  label: "CONFIGURACIÓN",
  items: [
    { label: "Empresa — Branding", href: "/admin/branding", icon: <Settings className="h-4 w-4" />, needsCompany: true, enabled: true },
    { label: "Empresa — Datos fiscales", href: "/admin/legal", icon: <Settings className="h-4 w-4" />, needsCompany: true, enabled: true },
    { label: "Empresa — Datos generales", href: "/admin/company", icon: <Settings className="h-4 w-4" />, needsCompany: true, enabled: true },
    { label: "Accesos — Usuarios", href: "/settings/users", icon: <Users className="h-4 w-4" />, needsCompany: false, enabled: true },
    { label: "Accesos — Roles", href: "/settings/roles", icon: <Shield className="h-4 w-4" />, needsCompany: false, enabled: true },

    // Integraciones por empresa
    { label: "Integraciones — Waitry", href: "/settings/integrations/waitry", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "waitry" },
    { label: "Integraciones — CFDI/Timbrado", href: "/settings/integrations/cfdi", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "cfdi" },
    { label: "Integraciones — Bancos", href: "/settings/integrations/banks", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "banks" },
    { label: "Integraciones — WhatsApp", href: "/settings/integrations/whatsapp", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "whatsapp" },
    { label: "Integraciones — Email (SMTP)", href: "/settings/integrations/email", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "smtp" },
    { label: "Integraciones — Almacenamiento (S3)", href: "/settings/integrations/storage", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "storage" },
    { label: "Integraciones — Webhooks", href: "/settings/integrations/webhooks", icon: <LinkIcon className="h-4 w-4" />, needsCompany: true, enabled: false, enabledByFeature: "webhooks" },
  ],
};

/* =========================
   4) SUPERADMIN (4°)
   ========================= */
export const SUPERADMIN: Section = {
  key: "superadmin",
  label: "SUPERADMIN",
  items: [
    { label: "Panel Superadmin", href: "/settings/admin", icon: <Shield className="h-4 w-4" />, enabled: true },
    { label: "Accesos globales", href: "/settings/access", icon: <Shield className="h-4 w-4" />, enabled: true },
    { label: "Empresas", href: "/companies", icon: <Boxes className="h-4 w-4" />, enabled: true },

    // Integraciones globales (catálogo/control central)
    { label: "Integraciones — Global", href: "/settings/integrations/global", icon: <LinkIcon className="h-4 w-4" />, enabled: false },
  ],
};

/** Construye el menú en orden fijo. SUPERADMIN solo si isSuperadmin = true */
export function buildSectionsOrdered(isSuperadmin: boolean): Section[] {
  const base: Section[] = [ADMINISTRACION, OPERACION, CONFIGURACION];
  return isSuperadmin ? [...base, SUPERADMIN] : base;
}
