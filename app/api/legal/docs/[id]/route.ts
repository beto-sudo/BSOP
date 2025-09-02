import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

/**
 * PUT /api/legal/docs/:id
 * body: campos a actualizar (title, category, issuedAt, expiresAt, notaryName, notaryNumber, city, state, summary)
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => ({}));
  const patch: any = {};
  ["title","category","issuedAt","expiresAt","notaryName","notaryNumber","city","state","summary"].forEach(k => {
    if (b[k] !== undefined) patch[k] = b[k] || null;
  });
  if (!Object.keys(patch).length) return NextResponse.json({ error: "no changes" }, { status: 400 });

  const { data, error } = await db
    .from("CompanyDocument")
    .update(patch)
    .eq("id", params.id)
    .select("id, category, title, issuedAt, expiresAt, notaryName, notaryNumber, city, state, summary, storage_path, createdAt")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * DELETE /api/legal/docs/:id
 * Elimina registro y archivo de Storage.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: doc, error: e1 } = await db
    .from("CompanyDocument").select("storage_path").eq("id", params.id).single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  if (doc?.storage_path) {
    await db.storage.from("legal").remove([doc.storage_path]);
  }
  const { error } = await db.from("CompanyDocument").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
