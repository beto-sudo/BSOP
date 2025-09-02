// app/api/legal/docs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type Ctx = { params: { id: string } };

// Si necesitas transformar la fila antes de regresar, hazlo aquí.
function mapRow<T>(r: T): T {
  return r;
}

/**
 * GET /api/legal/docs/[id]
 * Devuelve un documento por id.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const db = dbOrThrow();

    const { data, error } = await db
      .from("CompanyDocument") // ajusta el nombre si tu tabla se llama distinto
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(mapRow(data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/legal/docs/[id]
 * Actualiza campos del documento por id.
 * Body: JSON con el patch (campos a actualizar).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const patch = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no changes" }, { status: 400 });
    }

    const db = dbOrThrow();

    const { data, error } = await db
      .from("CompanyDocument") // ajusta si aplica
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(mapRow(data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/legal/docs/[id]
 * Elimina el documento por id.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const db = dbOrThrow();

    const { error } = await db
      .from("CompanyDocument") // ajusta si aplica
      .delete()
      .eq("id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
