// app/api/companies/route.ts
import { NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const revalidate = 0;

// Soportamos diferentes nombres de tabla
const CANDIDATES = ["Company", "company", "companies"] as const;

type Row = {
  id: string | number;
  name: string | null;
  slug?: string | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function pickTable(db: ReturnType<typeof dbOrThrow>) {
  for (const table of CANDIDATES) {
    const { error } = await db.from(table).select("id").limit(1);
    if (!error) return table;
  }
  return null;
}

export async function GET() {
  try {
    const db = dbOrThrow();

    const table = await pickTable(db);
    if (!table) {
      // No existe ninguna de las tablas candidatas
      return NextResponse.json([], { status: 200 });
    }

    // Intentamos traer name/slug si existen; si falta slug, lo generamos
    const { data, error } = await db
      .from(table)
      .select("id, name, slug")
      .order("name", { ascending: true });

    if (error) {
      // Si falla por columnas, traemos todo y mapeamos lo que haya
      const { data: raw, error: e2 } = await db.from(table).select("*");
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      const list = (raw ?? []).map((r: any) => ({
        id: r.id ?? r.ID ?? r.uuid ?? r.pk,
        name: r.name ?? r.Nombre ?? r.title ?? "",
        slug: r.slug ?? slugify(String(r.name ?? r.Nombre ?? r.id ?? "")),
      }));
      return NextResponse.json(list);
    }

    const rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      name: r.name ?? "",
      slug: r.slug ?? slugify(String(r.name ?? r.id)),
    }));

    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
