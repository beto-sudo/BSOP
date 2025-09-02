// app/api/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCompanyBySlug } from "@/lib/repos/companyRepo";

export const runtime = "nodejs";
export const revalidate = 0;

type MenuItem = { label: string; href: string; icon?: string };
type MenuGroup = { key: string; label: string; items: MenuItem[] };

function defaultMenu(): MenuGroup[] {
  return [
    {
      key: "operacion",
      label: "OPERACIÓN",
      items: [
        { label: "Órdenes de Compra", href: "/purchases/po" },
        { label: "Recepciones", href: "/purchases/receipts" },
        { label: "Movimientos de Inventario", href: "/inventory/moves" },
        { label: "Productos", href: "/inventory/products" },
      ],
    },
    { key: "administracion", label: "ADMINISTRACIÓN", items: [
        { label: "Usuarios", href: "/admin/users" },
        { label: "Roles & Permisos", href: "/admin/roles" },
    ]},
    { key: "configuracion", label: "CONFIGURACIÓN", items: [
        { label: "Empresa", href: "/admin/company" },
        { label: "Branding", href: "/admin/branding" },
    ]},
  ];
}

export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const company = await getCompanyBySlug(slug); // valida existencia
    const groups = defaultMenu();
    return NextResponse.json({ company: { id: company.id, slug: company.slug }, groups });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
