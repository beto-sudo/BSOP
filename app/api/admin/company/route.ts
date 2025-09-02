// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get("company") || "";
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("companies")
    .select("id,name,slug,settings")
    .eq("slug", company)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const company = searchParams.get("company") || "";
  const body = await req.json();

  const supabase = supabaseServer();
  const { data: current, error: e1 } = await supabase
    .from("companies")
    .select("id,settings")
    .eq("slug", company)
    .single();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

  const settings = { ...(current?.settings || {}), ...(body?.settings || {}) };

  const { error: e2 } = await supabase
    .from("companies")
    .update({ settings })
    .eq("id", current!.id);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
