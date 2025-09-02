// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Crea un cliente SSR con cookies del request/response para leer la sesión */
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
  const url = new URL(req.url);
  const slug = (url.searchParams.get("company") || "").toLowerCase();

  if (!slug) {
    return NextResponse.json({ error: "Missing 'company' param" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name, settings")
    .eq("slug", slug)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("company") || "").toLowerCase();

  if (!slug) {
    return NextResponse.json({ error: "Missing 'company' param" }, { status: 400 });
  }

  // Verifica sesión (no permitimos anónimos aunque usemos service-role)
  const res = new NextResponse();
  const supabaseSSR = ssrClient(req, res);
  const { data: sess } = await supabaseSSR.auth.getSession();
  if (!sess?.session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: res.headers });
  }

  // Lee cuerpo (espera { settings: { branding: {...} } })
  const body = await req.json().catch(() => ({}));
  const incomingSettings = body?.settings ?? {};
  if (typeof incomingSettings !== "object") {
    return NextResponse.json({ error: "Invalid payload: settings" }, { status: 400, headers: res.headers });
  }

  // Obtén fila actual
  const { data: current, error: e1 } = await supabaseAdmin
    .from("companies")
    .select("id, settings")
    .eq("slug", slug)
    .single();

  if (e1) return NextResponse.json({ error: e1.message }, { status: 400, headers: res.headers });

  const merged = { ...(current?.settings || {}), ...incomingSettings };

  const { error: e2 } = await supabaseAdmin
    .from("companies")
    .update({ settings: merged })
    .eq("id", current!.id);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 400, headers: res.headers });

  return NextResponse.json({ ok: true }, { headers: res.headers });
}
