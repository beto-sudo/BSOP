import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

type MenuItem = { label: string; path: string; children?: MenuItem[] };
type MenuGroup = { key: string; title: string; items: MenuItem[] };
type MenuCategory = { key: string; title: string; groups: MenuGroup[] };

const MENU_BASE: MenuCategory[] = [
  {
    key: "operacion",
    title: "Operación",
    groups: [
      {
        key: "compras",
        title: "Compras",
        items: [
          { label: "Órdenes de Compra", path: "/purchases/po" },
          { label: "Recepción", path: "/purchases/receiving" },
          { label: "Proveedores", path: "/purchases/suppliers" },
        ],
      },
      {
        key: "inventario",
        title: "Inventario",
        items: [
          { label: "Productos", path: "/products" },
          { label: "Movimientos", path: "/inventory/moves" },
        ],
      },
      {
        key: "ventas",
        title: "Ventas",
        items: [{ label: "Pedidos", path: "/sales/orders" }],
      },
      {
        key: "caja",
        title: "Caja",
        items: [{ label: "Movimientos", path: "/cash/movements" }],
      },
    ],
  },
  {
    key: "administracion",
    title: "Administración",
    groups: [
      { key: "finanzas", title: "Finanzas", items: [{ label: "Facturación", path: "/admin/finanzas/billing" }] },
      { key: "catalogos", title: "Catálogos", items: [{ label: "Unidades", path: "/admin/catalogs/units" }] },
      // 👇 Aquí está Legal / Documentos
      { key: "legal", title: "Legal / Documentos", items: [{ label: "Legal / Documentos", path: "/admin/legal" }] },
      { key: "gestion", title: "Gestión", items: [{ label: "Tareas", path: "/admin/management/tasks" }] },
      { key: "rh", title: "Recursos Humanos (RH)", items: [{ label: "Colaboradores", path: "/admin/hr/people" }] },
    ],
  },
  {
    key: "config",
    title: "Configuración",
    groups: [
      { key: "empresa", title: "Empresa", items: [{ label: "Empresa", path: "/admin/company" }] },
      { key: "branding", title: "Branding", items: [{ label: "Branding", path: "/admin/branding", children: [{ label: "Tema / Logo", path: "/admin/branding" }] }] },
      { key: "modulos", title: "Módulos y Menú", items: [{ label: "Módulos", path: "/admin/modules" }] },
      { key: "usuarios", title: "Usuarios y Roles", items: [{ label: "Usuarios y Roles", path: "/admin/users" }] },
      { key: "integraciones", title: "Integraciones", items: [{ label: "Integraciones", path: "/admin/integrations" }] },
    ],
  },
];

/** GET /api/menu?company=rincon */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("company") || "rincon").toLowerCase();

  // Validamos empresa (y de paso evitamos errores silenciosos)
  const { data: company, error: e1 } = await db.from("Company").select("id,slug").eq("slug", slug).single();
  if (e1 || !company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  // Módulos activos: se agregan como grupos al final de Operación
  const { data: cm } = await db
    .from("CompanyModule")
    .select("moduleKey, enabled")
    .eq("companyId", company.id)
    .eq("enabled", true);

  let categories: MenuCategory[] = JSON.parse(JSON.stringify(MENU_BASE));
  const operacion = categories.find((c) => c.key === "operacion");

  const keys = (cm ?? []).map((r) => r.moduleKey);
  if (operacion && keys.length) {
    const { data: mods } = await db.from("ModuleRegistry").select("key,name").in("key", keys);
    (mods ?? []).forEach((m) => {
      operacion.groups.push({
        key: `mod:${m.key}`,
        title: m.name,
        items: [{ label: "Dashboard", path: `/mod/${m.key}` }],
      });
    });
  }

  return NextResponse.json(categories);
}
