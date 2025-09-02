// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * GET /api/products?company=<slug>&q=<texto>&limit=50&offset=0
 * Lista productos de la empresa (por slug).
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("company") || "").toLowerCase();

    // Compat: si no viene company, regresa vacío (como hacía tu versión previa)
    if (!slug) return NextResponse.json([]);

    const db = dbOrThrow();

    // Resuelve empresa
    const { data: comp, error: e1 } = await db
      .from("Company")
      .select("id")
      .eq("slug", slug)
      .single();

    if (e1 || !comp) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }

    // Filtros simples
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

    let query = db
      .from("Product")
      .select("*")
      .eq("company_id", comp.id);

    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/products?company=<slug>
 * Crea un producto para la empresa dada. Body = JSON con campos del producto.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const db = dbOrThrow();

    const { data: comp, error: e1 } = await db
      .from("Company")
      .select("id")
      .eq("slug", slug)
      .single();

    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const row = { ...(body as any), company_id: comp.id };

    const { data, error } = await db
      .from("Product")
      .insert(row)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
