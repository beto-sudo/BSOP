// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only
  { auth: { persistSession: false } }
);

/* ── Tipos ─────────────────────────────────────────── */
type Palette = Record<string, string>;

type BrandingSecondary = {
  primary?: string;
  hue?: number;
  saturation?: number;
  lightness?: number;
  palette?: Palette;
};

type BrandingSettings = {
  brandName?: string;
  slogan?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  logoUrl?: string;

  primary?: string;
  hue?: number;
  saturation?: number;
  lightness?: number;
  palette?: Palette;

  secondary?: BrandingSecondary | string;
};

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  settings: { branding?: BrandingSettings } | null;
};

/* ── GET /api/admin/company?company=slug ───────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase().trim();
  if (!slug) return NextResponse.json({ error: "Missing ?company" }, { status: 400 });

  const { data, error } = await supabase
    .from("Company")
    .select("id,name,slug,settings")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  return NextResponse.json(data as CompanyRow);
}

/* ── PATCH /api/admin/company?company=slug ─────────────────── */
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase().trim();
  if (!slug) return NextResponse.json({ error: "Missing ?company" }, { status: 400 });

  const payload = (await req.json().catch(() => ({}))) as {
    settings?: { branding?: Partial<BrandingSettings> };
  };
  const incomingBranding = (payload?.settings?.branding ?? {}) as Partial<BrandingSettings>;

  // 1) Trae la compañía actual
  const { data: company, error: getErr } = await supabase
    .from("Company")
    .select("id,settings")
    .eq("slug", slug)
    .single();

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // 2) Mergea settings.branding sin perder otras claves
  const currentSettings = (company.settings ?? {}) as { branding?: BrandingSettings };
  const currentBranding = (currentSettings.branding ?? {}) as BrandingSettings;

  const nextBranding: BrandingSettings = {
    ...currentBranding,
    ...incomingBranding,
    // merge de nested "secondary"
    secondary: (() => {
      const inc = incomingBranding.secondary;
      const cur = currentBranding.secondary;
      if (typeof inc === "string" || typeof cur === "string") return inc ?? cur;
      return { ...(cur ?? {}), ...(inc ?? {}) };
    })(),
    // preferir palette/values entrantes si llegan
    palette: incomingBranding.palette ?? currentBranding.palette,
    values: Array.isArray(incomingBranding.values)
      ? incomingBranding.values
      : currentBranding.values ?? [],
  };

  if (!Array.isArray(nextBranding.values)) nextBranding.values = [];

  const nextSettings = { ...currentSettings, branding: nextBranding } as Record<string, unknown>;

  // 3) Persiste y devuelve
  const { data: updated, error: updErr } = await supabase
    .from("Company")
    .update({ settings: nextSettings })
    .eq("id", company.id)
    .select("id,name,slug,settings")
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json(updated as CompanyRow);
}
