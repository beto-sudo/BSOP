// app/api/legal/cap-table/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * GET /api/legal/cap-table?company=<slug>
 * Lista las entradas de cap table de la empresa dada (por slug).
 */
export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const db = dbOrThrow();

    // Busca la empresa por slug (usa el nombre exacto de tu tabla)
    const { data: comp, error: e1 } = await db
      .from("Company")
      .select("id")
      .eq("slug", slug)
      .single();

    if (e1 || !comp) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }

    // Carga las entradas (ajusta campos/orden si tu esquema es distinto)
    const { data, error } = await db
      .from("CapTableEntry")
      .select("*")
      .eq("company_id", comp.id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/legal/cap-table?company=<slug>
 * Crea una entrada nueva. Body JSON = campos de la fila.
 */
export async function POST(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const payload = await req.json().catch(() => ({}));
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    const db = dbOrThrow();

    const { data: comp, error: e1 } = await db
      .from("Company")
      .select("id")
      .eq("slug", slug)
      .single();
    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const row = { ...(payload as any), company_id: comp.id };
    const { data, error } = await db
      .from("CapTableEntry")
      .insert(row)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
