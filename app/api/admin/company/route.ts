// app/api/admin/company/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Server-only (no expongas esto al cliente)
);

// Merge profundo simple (objetos/arrays)
function deepMerge<T>(base: any, extra: any): T {
  if (Array.isArray(base) && Array.isArray(extra)) return extra as T;
  if (base && typeof base === "object" && extra && typeof extra === "object") {
    const out: any = { ...base };
    for (const k of Object.keys(extra)) out[k] = deepMerge(base[k], extra[k]);
    return out as T;
  }
  return (extra === undefined ? base : extra) as T;
}

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

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("company") || "").toLowerCase().trim();
  if (!slug) return NextResponse.json({ error: "Missing ?company" }, { status: 400 });

  const payload = await req.json().catch(() => ({}));
  const incomingBranding = payload?.settings?.branding ?? {};

  // 1) Trae la compañía actual
  const { data: company, error: getErr } = await supabase
    .from("Company")
    .select("id,settings")
    .eq("slug", slug)
    .single();

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // 2) Mergea settings.branding sin perder otras claves
  const currentSettings = company.settings ?? {};
  const currentBranding = currentSettings.branding ?? {};
  const nextBranding = deepMerge(currentBranding, incomingBranding);

  // normaliza valores/chips
  if (!Array.isArray(nextBranding.values)) nextBranding.values = [];

  const nextSettings = { ...currentSettings, branding: nextBranding };

  // 3) Persiste
  const { data: updated, error: updErr } = await supabase
    .from("Company")
    .update({ settings: nextSettings })
    .eq("id", company.id)
    .select("id,name,slug,settings")
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json(updated);
}
