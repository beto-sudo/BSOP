// app/api/companies/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

// Intenta varias tablas por si cambió el nombre; devuelve la primera que funcione
async function fetchCompaniesRaw() {
  const candidates = ["Company", "company", "companies"];
  for (const table of candidates) {
    const { data, error } = await db.from(table).select("*").order("name", { ascending: true });
    if (!error && Array.isArray(data)) {
      return { table, rows: data as any[] };
    }
  }
  throw new Error("No pude leer la tabla de empresas (Company/company/companies)");
}

// Normaliza el shape del registro de empresa
function normalizeCompany(r: any) {
  const id = r.id ?? r.uuid ?? r.pk ?? null;
  const name = r.name ?? r.displayName ?? r.company_name ?? "";
  const slug = (r.slug ?? r.code ?? r.alias ?? "").toLowerCase();
  const active = r.active; // opcional
  return { id, name, slug, active };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const includeAll = url.searchParams.get("all") === "1";

    const { rows } = await fetchCompaniesRaw();
    let list = rows.map(normalizeCompany).filter((x) => x.id && x.name && x.slug);

    // Si existe la columna active, por defecto muestra solo activas (a menos que ?all=1)
    const hasActive = list.some((x) => typeof x.active !== "undefined");
    if (hasActive && !includeAll) {
      list = list.filter((x) => x.active !== false);
    }

    // Devuelve solo lo necesario al cliente
    return NextResponse.json(list.map(({ id, name, slug }) => ({ id, name, slug })));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "companies failed" }, { status: 500 });
  }
}
