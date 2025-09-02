// app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type Ctx = { params: { id: string } };

// Opcional: ajusta si tu tabla no se llama exactamente "Product"

// GET /api/products/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const db = dbOrThrow();
    const { data, error } = await db.from("Product").select("*").eq("id", params.id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

// PATCH /api/products/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const patch = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no changes" }, { status: 400 });
    }
    const db = dbOrThrow();
    const { data, error } = await db
      .from("Product")
      .update(patch)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

// DELETE /api/products/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const db = dbOrThrow();
    const { error } = await db.from("Product").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
