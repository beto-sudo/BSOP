// app/api/admin/company/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Cliente admin (server-side) con SERVICE ROLE
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper SSR para leer la sesión desde cookies
function ssr(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

type AccessOk = { ok: true; companyId: string };
type AccessErr = { ok: false; resp: Response };

// Verifica sesión, empresa por slug y membresía
async function assertAccess(req: NextRequest, slug: string): Promise<AccessOk | AccessErr> {
  if (!slug) {
    return { ok: false, resp: NextResponse.json({ error: "Missing company" }, { status: 400 }) };
  }

  const supa = ssr(req);
  const { data: auth } = await supa.auth.getUser().catch(() => ({ data: { user: null } as any }));
  const user = auth.user;
  if (!user) return { ok: false, resp: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  // company
  const { data: company, error: cErr } = await admin
    .from("Company")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (cErr) return { ok: false, resp: NextResponse.json({ error: cErr.message }, { status: 500 }) };
  if (!company) return { ok: false, resp: NextResponse.json({ error: "Company not found" }, { status: 404 }) };

  // profile (por id y fallback por email)
  let profileId: string | null = null;
  const { data: pById } = await admin.from("profile").select("id").eq("id", user.id).maybeSingle();
  if (pById?.id) profileId = pById.id;
  if (!profileId && user.email) {
    const { data: pByEmail } = await admin.from("profile").select("id").eq("email", user.email).maybeSingle();
    if (pByEmail?.id) profileId = pByEmail.id;
  }
  if (!profileId) return { ok: false, resp: NextResponse.json({ error: "Profile not found" }, { status: 403 }) };

  // membership
  const { data: member } = await admin
    .from("company_member")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (!member) return { ok: false, resp: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { ok: true, companyId: String(company.id) };
}

/* GET: devuelve datos de la empresa */
export async function GET(req: NextRequest): Promise<Response> {
  const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase().trim();
  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;

  const { data, error } = await admin
    .from("Company")
    .select("id,name,legalName,rfc,email,phone,address,active,settings,slug")
    .eq("id", acc.companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

/* POST: actualiza empresa */
export async function POST(req: NextRequest): Promise<Response> {
  const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase().trim();
  const acc = await assertAccess(req, slug);
  if (!acc.ok) return acc.resp;

  const body = await req.json().catch(() => ({} as any));

  // address: texto → jsonb {text} si no es JSON válido
  let address: any = null;
  if (typeof body.address === "object" && body.address) {
    address = body.address;
  } else if (typeof body.address === "string") {
    const t = body.address.trim();
    if (t) {
      try { address = JSON.parse(t); }
      catch { address = { text: t }; }
    }
  }

  const settings = (typeof body.settings === "object" && body.settings) ? body.settings : {};

  const patch: Record<string, any> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.legalName === "string") patch.legalName = body.legalName.trim();
  if (typeof body.rfc === "string") patch.rfc = body.rfc.trim();
  if (typeof body.email === "string") patch.email = body.email.trim();
  if (typeof body.phone === "string") patch.phone = body.phone.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (address !== null) patch.address = address;
  if (Object.keys(settings).length) patch.settings = settings;

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
