// app/api/dev/seed-companies/route.ts
import { NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function GET() {
  try {
    const db = dbOrThrow();

    // Detectamos tabla destino
    const candidates = ["Company", "company", "companies"] as const;
    let table: (typeof candidates)[number] | null = null;
    for (const t of candidates) {
      const { error } = await db.from(t).select("id").limit(1);
      if (!error) { table = t; break; }
    }
    if (!table) table = "Company"; // por defecto

    const companies = [
      { name: "Agencia Stellantis", slug: slugify("Agencia Stellantis") },
      { name: "Rincón del Bosque", slug: slugify("Rincón del Bosque") },
    ];

    const { error } = await db.from(table).upsert(companies as any, { onConflict: "slug" } as any);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, inserted: companies.length, table });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
