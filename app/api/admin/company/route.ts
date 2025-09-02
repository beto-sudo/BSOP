// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

function bad(status: number, msg: string, headers?: HeadersInit) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("company") || "").toLowerCase();
  if (!slug) return bad(400, "Missing 'company' param");

  const admin = getSupabaseAdmin();
  if (!admin) return bad(500, "Missing SUPABASE_SERVICE_ROLE_KEY env var on server");

  const { data, error } = await admin
    .from("companies")
    .select("id, slug, name, settings")
    .eq("slug", slug)
    .single();

  if (error) return bad(400, error.message);
  if (!data) return bad(404, `Company not found for slug '${slug}'`);

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("company") || "").toLowerCase();
  if (!slug) return bad(400, "Missing 'company' param");

  // 1) Verifica sesión (no permitimos anónimos)
  const res = new NextResponse();
  const supabaseSSR = ssrClient(req, res);
  const { data: sess } = await supabaseSSR.auth.getSession();
  if (!sess?.session) return bad(401, "Not authenticated", res.headers);

  // 2) Valida payload
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const incomingSettings = body?.settings;
  if (!incomingSettings || typeof incomingSettings !== "object") {
    return bad(400, "Invalid payload: expecting { settings: { ... } }", res.headers);
  }

  // 3) Cliente admin (RLS bypass)
  const admin = getSupabaseAdmin();
  if (!admin) return bad(500, "Missing SUPABASE_SERVICE_ROLE_KEY env var on server", res.headers);

  // 4) Busca la empresa
  const { data: current, error: e1 } = await admin
    .from("companies")
    .select("id, settings")
    .eq("slug", slug)
    .single();

  if (e1) return bad(400, e1.message, res.headers);
  if (!current) return bad(404, `Company not found for slug '${slug}'`, res.headers);

  // 5) Merge de settings
  const merged = { ...(current.settings || {}), ...incomingSettings };

  // 6) Update
  const { error: e2 } = await admin
    .from("companies")
    .update({ settings: merged })
    .eq("id", current.id);

  if (e2) return bad(400, e2.message, res.headers);

  return NextResponse.json({ ok: true }, { headers: res.headers });
}
