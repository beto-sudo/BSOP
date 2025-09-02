import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await db.from("Product").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
