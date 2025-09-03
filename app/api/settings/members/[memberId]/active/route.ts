import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../../lib/db";

const paramsSchema = z.object({ memberId: z.string().uuid() });
const bodySchema = z.object({ is_active: z.boolean() });

export async function PATCH(req: NextRequest, ctx: { params: { memberId: string } }) {
  const pp = paramsSchema.safeParse(ctx.params);
  if (!pp.success) return NextResponse.json({ error: pp.error.flatten() }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const pb = bodySchema.safeParse(body);
  if (!pb.success) return NextResponse.json({ error: pb.error.flatten() }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("company_member")
    .update({ is_active: pb.data.is_active, updated_at: new Date().toISOString() })
    .eq("id", pp.data.memberId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
