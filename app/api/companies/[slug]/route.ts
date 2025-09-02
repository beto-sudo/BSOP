// app/api/companies/[slug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCompanyBySlug, updateCompanyBySlug } from "@/lib/repos/companyRepo";

export const runtime = "nodejs";
export const revalidate = 0;

function bad(status: number, msg: string) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const slug = (params.slug || "").toLowerCase();
    if (!slug) return bad(400, "Missing slug");
    const dto = await getCompanyBySlug(slug);
    return NextResponse.json(dto);
  } catch (e: any) {
    return bad(400, e?.message || "Cannot load company");
  }
}

async function write(req: NextRequest, { params }: { params: { slug: string } }) {
  const slug = (params.slug || "").toLowerCase();
  if (!slug) return bad(400, "Missing slug");

  const body = await req.json().catch(() => ({}));

  await updateCompanyBySlug(slug, {
    name:      body?.name,
    tradeName: body?.tradeName,
    legalName: body?.legalName ?? body?.razonSocial,
    rfc:       body?.rfc,
    email:     body?.email,
    phone:     body?.phone ?? body?.telefono,
    address:   body?.address ?? body?.direccion,
    active:    body?.active,
  });

  const company = await getCompanyBySlug(slug);
  return NextResponse.json({ ok: true, company });
}

export async function PUT(req: NextRequest, ctx: { params: { slug: string } }) {
  try { return await write(req, ctx); } catch (e:any) { return bad(400, e?.message || "Cannot save company"); }
}
export async function PATCH(req: NextRequest, ctx: { params: { slug: string } }) {
  try { return await write(req, ctx); } catch (e:any) { return bad(400, e?.message || "Cannot save company"); }
}
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
