import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

function mapRow(r: any) {
  return {
    id: r.id,
    holderName: r.holder_name ?? null,
    holderRfc:  r.holder_rfc  ?? null,
    personType: r.person_type ?? null,
    shares:     r.shares      ?? null,
    percentage: r.percentage  ?? null,
    series:     r.series      ?? null,
    documentId: r.document_id ?? null,
    notes:      r.notes       ?? null,
    createdAt:  r.createdAt   ?? null,
  };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await req.json().catch(() => ({}));
    const patch: any = {};
    if (b.holderName !== undefined) patch.holder_name = b.holderName || null;
    if (b.holderRfc  !== undefined) patch.holder_rfc  = b.holderRfc  || null;
    if (b.personType !== undefined) patch.person_type = b.personType || null;
    if (b.shares     !== undefined) patch.shares      = b.shares;
    if (b.percentage !== undefined) patch.percentage  = b.percentage;
    if (b.series     !== undefined) patch.series      = b.series;
    if (b.documentId !== undefined) patch.document_id = b.documentId;
    if (b.notes      !== undefined) patch.notes       = b.notes;

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "no changes" }, { status: 400 });

    const { data, error } = await db.from("CapTableEntry").update(patch).eq("id", params.id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(mapRow(data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PUT failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await db.from("CapTableEntry").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "DELETE failed" }, { status: 500 });
  }
}
