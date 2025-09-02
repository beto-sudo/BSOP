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

async function read(req: NextRequest) {
  const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
  if (!slug) return bad(400, "Missing 'company' param");
  const dto = await getCompanyBySlug(slug);
  return NextResponse.json(dto);
}

async function write(req: NextRequest) {
  const url = new URL(req.url);
  let slug = (url.searchParams.get("company") || "").toLowerCase();
  const body = await req.json().catch(() => ({}));
  if (!slug) slug = (body?.slug || body?.company || "").toLowerCase();
  if (!slug) return bad(400, "Missing 'company' slug");

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

  // <- devolvemos la empresa normalizada para repoblar el form
  const company = await getCompanyBySlug(slug);
  return NextResponse.json({ ok: true, company });
}

export async function GET(req: NextRequest)   { try { return await read(req);  } catch (e:any){ return bad(400, e?.message || "Cannot load company"); } }
export async function PUT(req: NextRequest)   { try { return await write(req); } catch (e:any){ return bad(400, e?.message || "Cannot save company"); } }
export async function PATCH(req: NextRequest) { try { return await write(req); } catch (e:any){ return bad(400, e?.message || "Cannot save company"); } }
export async function POST(req: NextRequest)  { try { return await write(req); } catch (e:any){ return bad(400, e?.message || "Cannot save company"); } }
export async function OPTIONS() { return new NextResponse(null, { status: 204 }); }
