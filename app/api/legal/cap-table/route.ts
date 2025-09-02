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

// GET /api/legal/cap-table?company=slug
export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const { data: comp, error: e1 } = await db.from("Company").select("id").eq("slug", slug).single();
    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const { data, error } = await db
      .from("CapTableEntry")
      .select("*")
      .eq("companyId", comp.id)            // <- usa tu columna real
      .order("createdAt", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data ?? []).map(mapRow));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "GET failed" }, { status: 500 });
  }
}

// POST /api/legal/cap-table
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const slug = (b.company || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const { data: comp, error: e1 } = await db.from("Company").select("id").eq("slug", slug).single();
    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    const v = {
      holderName: (b.holderName ?? "").trim(),
      holderRfc: (b.holderRfc ?? "").trim() || null,
      personType: b.personType ?? null,
      shares: b.shares ?? null,
      percentage: b.percentage ?? null,
      series: b.series ?? null,
      documentId: b.documentId ?? null,
      notes: b.notes ?? null,
    };
    if (!v.holderName) return NextResponse.json({ error: "holderName required" }, { status: 400 });

    // Usa tu esquema híbrido actual: companyId (camel) + resto snake_case
    const insertObj: any = {
      companyId: comp.id,
      holder_name: v.holderName,
      holder_rfc: v.holderRfc,
      person_type: v.personType,
      shares: v.shares,
      percentage: v.percentage,
      series: v.series,
      notes: v.notes,
    };
    if (v.documentId) insertObj.document_id = v.documentId;

    const { data, error } = await db.from("CapTableEntry").insert(insertObj).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(mapRow(data), { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "POST failed" }, { status: 500 });
  }
}
