// app/api/companies/route.ts
import { NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const revalidate = 0;

type Row = { id: string | number; name: string | null; slug?: string | null };

function slugify(s: string) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export async function GET() {
  try {
    const db = dbOrThrow();
    const { data, error } = await db.from("companies").select("id,name,slug").order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
