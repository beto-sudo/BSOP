// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getCompanyBySlug, updateCompanyBySlug } from "@/lib/repos/companyRepo";

export const runtime = "nodejs";
export const revalidate = 0;

function bad(status: number, msg: string, headers?: HeadersInit) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}

function ssrClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );
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
  const res = new NextResponse();
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param", res.headers);

    // requiere sesión para escribir
    const supabaseSSR = ssrClient(req, res);
    const { data: sess } = await supabaseSSR.auth.getSession();
    if (!sess?.session) return bad(401, "Not authenticated", res.headers);

    const body = await req.json().catch(() => ({}));
    await updateCompanyBySlug(slug, {
      name: body?.name,
      legalName: body?.legalName ?? body?.razonSocial,
      rfc: body?.rfc,
      email: body?.email,
      phone: body?.phone ?? body?.telefono,
      address: body?.address ?? body?.direccion,
      active: body?.active,
    });

    return NextResponse.json({ ok: true }, { headers: res.headers });
  } catch (e: any) {
    return bad(400, e?.message || "Cannot save company", res.headers);
  }
}
