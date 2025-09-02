// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";

export const revalidate = 0;

// Utilidad: normaliza lectura (top-level o settings.profile)
function pickCompany(row: any) {
  const st = row.settings ?? {};
  const pf = st.profile ?? {};

  const legalName = row.legal_name ?? pf.legalName ?? null;
  const rfc       = row.rfc        ?? pf.rfc       ?? null;
  const email     = row.email      ?? pf.email     ?? null;
  const phone     = row.phone      ?? pf.phone     ?? null;

  // Asegura que address sea string (evita "[object Object]")
  const addressRaw = row.address ?? pf.address ?? null;
  const address =
    typeof addressRaw === "string"
      ? addressRaw
      : addressRaw
      ? JSON.stringify(addressRaw)
      : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name ?? "",
    legalName,
    rfc,
    email,
    phone,
    address,
    active: typeof row.active === "boolean" ? row.active : true,
    settings: {
      // preserva branding
      branding: st.branding ?? {
        brandName: row.name ?? "",
        primaryColor: "#4f46e5",
        secondaryColor: "#14b8a6",
        logoUrl: null,
      },
      // expone perfil también
      profile: {
        legalName,
        rfc,
        email,
        phone,
        address,
      },
    },
  };
}

// GET /api/admin/company?company=slug
export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const { data, error } = await db.from("Company").select("*").eq("slug", slug).single();
    if (error || !data) return NextResponse.json({ error: "company not found" }, { status: 404 });

    return NextResponse.json(pickCompany(data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "GET failed" }, { status: 500 });
  }
}

// PUT /api/admin/company
// body: { company, name?, legalName?, rfc?, email?, phone?, address?, active?, branding? }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (body.company || "").toLowerCase();
    if (!slug) return NextResponse.json({ error: "company required" }, { status: 400 });

    const { data: comp, error: e1 } = await db.from("Company").select("*").eq("slug", slug).single();
    if (e1 || !comp) return NextResponse.json({ error: "company not found" }, { status: 404 });

    // Construye settings.profile (si top-level no existe, guardamos aquí)
    const currentSettings = comp.settings ?? {};
    const currentBranding = currentSettings.branding ?? {};
    const currentProfile  = currentSettings.profile  ?? {};

    const newProfile = {
      legalName: body.legalName ?? currentProfile.legalName ?? (comp.legal_name ?? null),
      rfc:       body.rfc       ?? currentProfile.rfc       ?? (comp.rfc ?? null),
      email:     body.email     ?? currentProfile.email     ?? (comp.email ?? null),
      phone:     body.phone     ?? currentProfile.phone     ?? (comp.phone ?? null),
      address:   body.address   ?? currentProfile.address   ?? (comp.address ?? null),
    };

    const brandingIn = body.branding ?? {};
    const newBranding = {
      brandName: brandingIn.brandName ?? currentBranding.brandName ?? comp.name ?? "",
      primaryColor: brandingIn.primaryColor ?? currentBranding.primaryColor ?? "#4f46e5",
      secondaryColor: brandingIn.secondaryColor ?? currentBranding.secondaryColor ?? "#14b8a6",
      logoUrl: brandingIn.logoUrl ?? currentBranding.logoUrl ?? null,
    };

    const basePatch: any = {
      // name casi seguro existe en tu tabla
      ...(body.name !== undefined ? { name: body.name || "" } : null),
      settings: { ...currentSettings, branding: newBranding, profile: newProfile },
    };

    // Intento 1: si tienes 'active' en la tabla, lo incluimos;
    // si no existe, PostgREST se quejará y hacemos fallback.
    if (body.active !== undefined) basePatch.active = !!body.active;

    let upd = await db.from("Company").update(basePatch).eq("id", comp.id).select("*").single();

    // Fallback: si falló por columna desconocida (p.ej. active), reintentamos sin esa columna
    if (upd.error && /column .* does not exist/i.test(upd.error.message)) {
      const { active, ...withoutUnknown } = basePatch;
      upd = await db.from("Company").update(withoutUnknown).eq("id", comp.id).select("*").single();
    }

    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });

    return NextResponse.json(pickCompany(upd.data));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PUT failed" }, { status: 500 });
  }
}
