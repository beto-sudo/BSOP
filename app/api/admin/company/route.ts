// app/api/admin/company/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { isSuperadminEmail } from "@/lib/superadmin";

// Cliente admin (server-side) con SERVICE ROLE
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper SSR para leer la sesión desde cookies (sin service role)
function ssr(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // usa ANON para leer sesión
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
      },
    }
  );
}

type AccessOk = { ok: true; companyId: string; userEmail: string };
type AccessErr = { ok: false; resp: Response };

/** Resuelve profile.id del usuario autenticado (puede no coincidir con auth.user.id) */
async function resolveProfileId(supa: ReturnType<typeof ssr>, email: string, authId: string) {
  // a) por id
  const { data: pById } = await supa
    .from("profile")
    .select("id,email")
    .eq("id", authId)
    .maybeSingle();

  if (pById?.id) return pById.id;

  // b) por email
  const { data: pByEmail } = await supa
    .from("profile")
    .select("id,email")
    .eq("email", email ?? "")
    .maybeSingle();

  return pByEmail?.id || null;
}

/** Verifica sesión, existencia de empresa por slug y membresía (a menos que sea superadmin) */
async function assertAccess(req: NextRequest, slug: string): Promise<AccessOk | AccessErr> {
  if (!slug) {
    return { ok: false, resp: NextResponse.json({ error: "Missing company" }, { status: 400 }) };
  }

  const supa = ssr(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;

  if (!user) {
    return {
      ok: false,
      resp: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Empresa por slug
  const { data: company, error: cErr } = await admin
    .from("Company")
    .select("id,slug,active")
    .eq("slug", slug)
    .maybeSingle();

  if (cErr) {
    return { ok: false, resp: NextResponse.json({ error: cErr.message }, { status: 500 }) };
  }
  if (!company) {
    return { ok: false, resp: NextResponse.json({ error: "Company not found" }, { status: 404 }) };
  }

  // Superadmin: acceso total
  if (isSuperadminEmail(user.email)) {
    return { ok: true, companyId: company.id, userEmail: user.email ?? "" };
  }

  // Usuario normal: validar membership
  const profileId = await resolveProfileId(supa, user.email ?? "", user.id);
  if (!profileId) {
    return {
      ok: false,
      resp: NextResponse.json({ error: "Profile not found for user" }, { status: 403 }),
    };
  }

  const { data: membership, error: mErr } = await admin
    .from("company_member")
    .select("id, is_active")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();

  if (mErr) {
    return { ok: false, resp: NextResponse.json({ error: mErr.message }, { status: 500 }) };
  }
  if (!membership || membership.is_active === false) {
    return {
      ok: false,
      resp: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, companyId: company.id, userEmail: user.email ?? "" };
}

/** Deep merge sencillo (objetos) y reemplazo directo en arrays */
function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: any = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = deepMerge(a?.[k], b[k]);
    }
    return out;
  }
  return b !== undefined ? b : a;
}

// ------------------------ GET ------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase().trim();
  const debug = searchParams.get("debug") === "1";

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;

  // Cargar datos completos de la compañía
  const { data, error } = await admin
    .from("Company")
    .select("id,name,legalName,rfc,email,phone,address,active,settings,slug")
    .eq("id", acc.companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (debug) {
    return NextResponse.json({
      company: data,
      user: acc.userEmail,
      note: "GET /api/admin/company?company=...&debug=1",
    });
  }

  // Respuesta “plana” con lo necesario para UI
  return NextResponse.json({
    id: data.id,
    name: data.name,
    legalName: (data as any).legalName ?? null,
    rfc: (data as any).rfc ?? null,
    email: (data as any).email ?? null,
    phone: (data as any).phone ?? null,
    address: (data as any).address ?? null,
    active: data.active,
    settings: data.settings ?? {},
    slug: data.slug,
  });
}

// ------------------------ PUT ------------------------
export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase().trim();

  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Campos aceptados (todos opcionales). Para escalares, solo tocar si vienen definidos.
  const {
    name,
    legalName,
    rfc,
    email,
    phone,
    address, // puede venir null para limpiar
    active,  // boolean
    settings, // objeto parcial para MERGE
  } = body || {};

  const patch: any = {};

  if ("name" in body) patch.name = name ?? null;
  if ("legalName" in body) patch.legalName = legalName ?? null;
  if ("rfc" in body) patch.rfc = rfc ?? null;
  if ("email" in body) patch.email = email ?? null;
  if ("phone" in body) patch.phone = phone ?? null;
  if ("active" in body) patch.active = typeof active === "boolean" ? active : null;
  if ("address" in body) patch.address = address ?? null;

  // Merge profundo de settings (no sobrescribir con objeto parcial)
  if (settings && typeof settings === "object") {
    const { data: current } = await admin
      .from("Company")
      .select("settings")
      .eq("id", acc.companyId)
      .maybeSingle();

    const curr = (current?.settings ?? {}) as Record<string, any>;
    patch.settings = deepMerge(curr, settings);
  }

  const { data, error } = await admin
    .from("Company")
    .update(patch)
    .eq("id", acc.companyId)
    .select("id,name,legalName,rfc,email,phone,address,active,settings,slug")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, company: data });
}
