// app/api/companies/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// desactiva caché para que la lista de empresas siempre esté fresca
export const revalidate = 0;

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

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    // Narrowing: si falta la env var del service role, devolvemos 500 y TS sabe que no es null después
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" },
      { status: 500 }
    );
  }

  // lee de la tabla 'companies'; ajusta campos si usas nombres distintos
  const { data, error } = await admin
    .from("companies")
    .select("id,name,slug")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []).map((r: Row) => ({
    id: r.id,
    name: r.name ?? "",
    slug: r.slug ?? slugify(String(r.name ?? r.id)),
  }));

  return NextResponse.json(rows);
}
