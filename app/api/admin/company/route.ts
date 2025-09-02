// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { dbOrThrow } from "@/lib/db";

function ssrClient(req: NextRequest, res: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
}

function bad(status: number, msg: string, headers?: HeadersInit) {
  return new NextResponse(JSON.stringify({ error: msg }), {
    status, headers: { "Content-Type": "application/json", ...(headers || {}) },
  });
}

export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param");
    const db = dbOrThrow();
    const { data, error } = await db.from("companies").select("id,slug,name,settings").eq("slug", slug).single();
    if (error) return bad(400, error.message);
    if (!data) return bad(404, `Company not found for slug '${slug}'`);
    return NextResponse.json(data);
  } catch (e: any) {
    return bad(500, e?.message || "Server error");
  }
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param", res.headers);

    // exige sesión
    const supabaseSSR = ssrClient(req, res);
    const { data: sess } = await supabaseSSR.auth.getSession();
    if (!sess?.session) return bad(401, "Not authenticated", res.headers);

    const body = await req.json().catch(() => ({}));
    const incomingSettings = body?.settings;
    if (!incomingSettings || typeof incomingSettings !== "object") {
      return bad(400, "Invalid payload: expecting { settings: { ... } }", res.headers);
    }

    const db = dbOrThrow();
    const { data: current, error: e1 } = await db.from("companies").select("id,settings").eq("slug", slug).single();
    if (e1) return bad(400, e1.message, res.headers);
    if (!current) return bad(404, `Company not found for slug '${slug}'`, res.headers);

    const merged = { ...(current.settings || {}), ...incomingSettings };
    const { error: e2 } = await db.from("companies").update({ settings: merged }).eq("id", current.id);
    if (e2) return bad(400, e2.message, res.headers);

    return NextResponse.json({ ok: true }, { headers: res.headers });
  } catch (e: any) {
    return bad(500, e?.message || "Server error", res.headers);
  }
}
