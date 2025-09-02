import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
  if (!slug) return NextResponse.json([]);

  const { data: company, error: e1 } = await db.from("Company").select("id").eq("slug", slug).single();
  if (e1 || !company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  const { data, error } = await db
    .from("Product")
    .select("id,name,sku,isActive")
    .eq("companyId", company.id)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const slug = (body.company || "").toLowerCase();
  const name = (body.name || "").trim();
  const sku  = (body.sku || "").trim();

  if (!slug || !name) return NextResponse.json({ error: "company and name required" }, { status: 400 });

  const { data: company, error: e1 } = await db.from("Company").select("id").eq("slug", slug).single();
  if (e1 || !company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  const { data, error } = await db
    .from("Product")
    .insert({ companyId: company.id, name, sku, isActive: true })
    .select("id,name,sku,isActive")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
