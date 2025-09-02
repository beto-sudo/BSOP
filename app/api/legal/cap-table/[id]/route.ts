// app/api/legal/cap-table/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

type Ctx = { params: { id: string } };

function mapRow<T>(r: T): T { return r; }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const db = dbOrThrow();
    const { data, error } = await db.from("CapTableEntry").select("*").eq("id", params.id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(mapRow(data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const patch = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no changes" }, { status: 400 });
    }
    const db = dbOrThrow();
    const { data, error } = await db
      .from("CapTableEntry")
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
