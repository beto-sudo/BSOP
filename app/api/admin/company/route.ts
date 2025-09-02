// app/api/admin/company/route.ts
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

export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param");
    const dto = await getCompanyBySlug(slug);
    return NextResponse.json(dto);
  } catch (e: any) {
    return bad(400, e?.message || "Cannot load company");
  }
}

export async function POST(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param");

    const body = await req.json().catch(() => ({}));
    await updateCompanyBySlug(slug, {
      name:      body?.name,
      tradeName: body?.tradeName,           // si el UI decide enviarlo
      legalName: body?.legalName ?? body?.razonSocial,
      rfc:       body?.rfc,
      email:     body?.email,
      phone:     body?.phone ?? body?.telefono,
      address:   body?.address ?? body?.direccion,
      active:    body?.active,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(400, e?.message || "Cannot save company");
  }
}
