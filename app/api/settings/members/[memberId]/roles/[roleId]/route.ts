import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../../../lib/db";

const paramsSchema = z.object({ memberId: z.string().uuid(), roleId: z.string().uuid() });

export async function POST(_req: NextRequest, ctx: { params: { memberId: string; roleId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("member_role")
    .insert({ company_member_id: p.data.memberId, role_id: p.data.roleId })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: { memberId: string; roleId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("member_role")
    .delete()
    .eq("company_member_id", p.data.memberId)
    .eq("role_id", p.data.roleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
