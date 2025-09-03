import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../../lib/db";

const bodySchema = z.object({
  token: z.string().min(8),
  userId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: inv, error: invErr } = await supabaseAdmin.from("invitation").select("*").eq("token", parsed.data.token).single();
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  if (!inv) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: "Invitation not pending" }, { status: 400 });
  if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: "Invitation expired" }, { status: 400 });

  const { data: prof } = await supabaseAdmin.from("profile").select("id").eq("id", parsed.data.userId).single();
  if (!prof) {
    const { error: profErr } = await supabaseAdmin.from("profile").insert({ id: parsed.data.userId, email: inv.email });
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const { data: existing } = await supabaseAdmin
    .from("company_member")
    .select("id")
    .eq("company_id", inv.company_id)
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  let memberId = existing?.id;
  if (!memberId) {
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("company_member")
      .insert({ company_id: inv.company_id, user_id: parsed.data.userId, is_active: true })
      .select("id").single();
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
    memberId = mem.id;
  }

  const roleIds: string[] = inv.role_ids || [];
  for (const rid of roleIds) {
    await supabaseAdmin.from("member_role").insert({ company_member_id: memberId, role_id: rid });
  }

  const { error: updErr } = await supabaseAdmin.from("invitation").update({ status: "accepted" }).eq("id", inv.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ member_id: memberId, company_id: inv.company_id });
}
