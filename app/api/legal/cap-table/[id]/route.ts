// app/api/legal/cap-table/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const revalidate = 0;

type Ctx = { params: { id: string } };

// Si necesitas transformar la fila antes de responder, hazlo aquí.
function mapRow<T>(r: T): T {
  return r;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" },
      { status: 500 }
    );
  }

  const { data, error } = await db
    .from("CapTableEntry")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(mapRow(data));
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const db = getSupabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" },
      { status: 500 }
    );
  }

  let patch: Record<string, unknown> = {};
  try {
    patch = await req.json();
  } catch {
    // ignore
  }

  if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }

  const { data, error } = await db
    .from("CapTableEntry")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapRow(data));
}
