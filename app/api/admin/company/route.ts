// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { dbOrThrow } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

function bad(status: number, msg: string, headers?: HeadersInit) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}

// Para leer la sesión (solo la usamos en POST para exigir login)
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

const TABLE_CANDIDATES = ["Company", "company", "companies"] as const;

async function pickCompanyTable(db: ReturnType<typeof dbOrThrow>) {
  for (const t of TABLE_CANDIDATES) {
    const { error } = await db.from(t).select("id").limit(1);
    if (!error) return t;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param");

    const db = dbOrThrow();
    const table = await pickCompanyTable(db);
    if (!table) return bad(404, "Companies table not found");

    // ilike para que sea tolerante a mayúsculas
    const { data, error } = await db
      .from(table)
      .select("id, slug, name, settings")
      .ilike("slug", slug)
      .single();

    if (error) return bad(400, error.message);
    if (!data) return bad(404, `Company not found for slug '${slug}'`);

    // Normalizamos settings a objeto
    return NextResponse.json({
      id: data.id,
      slug: data.slug,
      name: data.name,
      settings: data.settings ?? {},
    });
  } catch (e: any) {
    return bad(500, e?.message || "Server error");
  }
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param", res.headers);

    // Exige sesión para escribir
    const supabaseSSR = ssrClient(req, res);
    const { data: sess } = await supabaseSSR.auth.getSession();
    if (!sess?.session) return bad(401, "Not authenticated", res.headers);

    const body = await req.json().catch(() => ({}));
    const incomingSettings = body?.settings;
    if (!incomingSettings || typeof incomingSettings !== "object") {
      return bad(400, "Invalid payload: expecting { settings: { ... } }", res.headers);
    }

    const db = dbOrThrow();
    const table = await pickCompanyTable(db);
    if (!table) return bad(404, "Companies table not found", res.headers);

    const { data: current, error: e1 } = await db
      .from(table)
      .select("id, settings")
      .ilike("slug", slug)
      .single();

    if (e1) return bad(400, e1.message, res.headers);
    if (!current) return bad(404, `Company not found for slug '${slug}'`, res.headers);

    const merged = { ...(current.settings || {}), ...incomingSettings };

    const { error: e2 } = await db
      .from(table)
      .update({ settings: merged })
      .eq("id", current.id);

    if (e2) return bad(400, e2.message, res.headers);

    return NextResponse.json({ ok: true }, { headers: res.headers });
  } catch (e: any) {
    return bad(500, e?.message || "Server error", res.headers);
  }
}
