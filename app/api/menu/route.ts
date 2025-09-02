// app/api/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type CompanyRow = {
  id: string | number;
  slug: string;
  settings?: {
    modules?: string[];
    activeModules?: string[];
  } | null;
};

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
    {
      key: "administracion",
      label: "ADMINISTRACIÓN",
      items: [
        { label: "Usuarios", href: "/admin/users" },
        { label: "Roles & Permisos", href: "/admin/roles" },
      ],
    },
    {
      key: "configuracion",
      label: "CONFIGURACIÓN",
      items: [
        { label: "Empresa", href: "/admin/company" },
        { label: "Branding", href: "/admin/branding" },
      ],
    },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("company") || "").toLowerCase();
    if (!slug) {
      return NextResponse.json({ error: "company required" }, { status: 400 });
    }

    const db = dbOrThrow();

    // Buscamos la empresa por slug (ajusta el nombre de la tabla si la tuya difiere)
    const { data: company, error: e1 } = await db
      .from("Company")
      .select("id,slug,settings")
      .eq("slug", slug)
      .single<CompanyRow>();

    if (e1 || !company) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }

    // Si en settings hay módulos activos, podrías filtrar/activar items aquí.
    const active =
      company.settings?.activeModules ??
      company.settings?.modules ??
      [];

    let groups = defaultMenu();

    // Ejemplo tonto de filtro: si NO existe "compras", quitamos el PO/Recepciones.
    if (Array.isArray(active) && active.length) {
      const hasPurchases = active.includes("compras") || active.includes("purchases");
      if (!hasPurchases) {
        groups = groups.map((g) =>
          g.key !== "operacion"
            ? g
            : {
                ...g,
                items: g.items.filter(
                  (it) => !["/purchases/po", "/purchases/receipts"].includes(it.href)
                ),
              }
        );
      }
    }

    return NextResponse.json({
      company: { id: company.id, slug: company.slug },
      groups,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
