import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../lib/db";

const paramsSchema = z.object({ roleId: z.string().uuid() });
const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: { roleId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("role").select("*").eq("id", p.data.roleId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, ctx: { params: { roleId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const b = patchSchema.safeParse(body);
  if (!b.success) return NextResponse.json({ error: b.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("role")
    .update({ ...b.data, updated_at: new Date().toISOString() })
    .eq("id", p.data.roleId)
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
