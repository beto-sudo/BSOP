import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../../lib/db";
import { paginationSchema, companyParamSchema } from "../../../../lib/zod";

const querySchema = paginationSchema.extend({
  companyId: companyParamSchema.shape.companyId,
  query: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    companyId: searchParams.get("companyId"),
    query: searchParams.get("query") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { companyId, query, limit, offset } = parsed.data;

  let q = supabaseAdmin
    .from("company_member_view")
    .select("*", { count: "exact" })
    .eq("company_id", companyId);

  if (query) {
    q = q.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
  }

  q = q.order("full_name", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], count: count ?? 0 });
}
