import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../lib/db";
import crypto from "crypto";

const postSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().email(),
  roleIds: z.array(z.string().uuid()).default([]),
  invitedBy: z.string().uuid(),
  expiresAt: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const token = crypto.randomBytes(18).toString("hex");
  const { data, error } = await supabaseAdmin
    .from("invitation")
    .insert({
      company_id: parsed.data.companyId,
      email: parsed.data.email.toLowerCase(),
      role_ids: parsed.data.roleIds,
      invited_by: parsed.data.invitedBy,
      token,
      status: "pending",
      expires_at: parsed.data.expiresAt,
    })
    .select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data });
}
