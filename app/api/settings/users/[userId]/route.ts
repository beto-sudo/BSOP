import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../lib/db";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function GET(_req: NextRequest, ctx: { params: { userId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("profile").select("*").eq("id", p.data.userId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

const patchSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  avatar_url: z.string().optional(),
  locale: z.string().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { userId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("profile")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", p.data.userId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
