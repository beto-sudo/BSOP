import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../lib/db";

const getSchema = z.object({ companyId: z.string().uuid() });
const postSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = getSchema.safeParse({ companyId: searchParams.get("companyId") });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("role")
    .select("*")
    .eq("company_id", parsed.data.companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("role")
    .insert({
      company_id: parsed.data.companyId,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      is_system: false,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
