import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../lib/db";

const querySchema = z.object({
  companyId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    companyId: searchParams.get("companyId") ?? undefined,
    entityType: searchParams.get("entityType") ?? undefined,
    entityId: searchParams.get("entityId") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let q = supabaseAdmin.from("audit_log").select("*", { count: "exact" });
  if (parsed.data.companyId) q = q.eq("company_id", parsed.data.companyId);
  if (parsed.data.entityType) q = q.eq("entity_type", parsed.data.entityType);
  if (parsed.data.entityId) q = q.eq("entity_id", parsed.data.entityId);
  q = q.order("created_at", { ascending: false }).range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);
  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], count: count ?? 0 });
}
