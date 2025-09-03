import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../../lib/db";

const paramsSchema = z.object({ memberId: z.string().uuid() });
const bodySchema = z.object({
  items: z.array(z.object({
    module_key: z.string(),
    permission_key: z.string(),
    allowed: z.boolean(),
  }))
});

export async function PUT(req: NextRequest, ctx: { params: { memberId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const b = bodySchema.safeParse(body);
  if (!b.success) return NextResponse.json({ error: b.error.flatten() }, { status: 400 });

  const { error: delErr } = await supabaseAdmin.from("member_permission_override").delete().eq("company_member_id", p.data.memberId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: mods } = await supabaseAdmin.from("module").select("id,key");
  const { data: perms } = await supabaseAdmin.from("permission").select("id,key");
  const mMap = new Map((mods ?? []).map((m: any) => [m.key, m.id]));
  const pMap = new Map((perms ?? []).map((p: any) => [p.key, p.id]));

  const rows = b.data.items.map((x) => ({
    company_member_id: p.data.memberId,
    module_id: mMap.get(x.module_key),
    permission_id: pMap.get(x.permission_key),
    allowed: x.allowed,
  })).filter((r) => r.module_id && r.permission_id);

  if (!rows.length) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin.from("member_permission_override").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: { memberId: string } }) {
  const p = paramsSchema.safeParse(ctx.params);
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const { error } = await supabaseAdmin.from("member_permission_override").delete().eq("company_member_id", p.data.memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
