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

function toBool(x: unknown): boolean {
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return x === 1;
  if (typeof x === "string") {
    const v = x.toLowerCase();
    return ["1", "true", "activo", "active", "enabled", "yes", "sí", "si"].includes(v);
  }
  return false;
}

type CompanyDTO = {
  id: string | number;
  slug: string;
  name: string;
  legalName?: string;
  rfc?: string;
  email?: string;
  phone?: string;
  address?: string;
  active?: boolean;
  settings?: any;
};

function normalizeCompany(row: any): CompanyDTO {
  const s = row?.settings ?? {};
  const sc = s?.company ?? {};

  const legalName = row.legal_name ?? row.razon_social ?? sc.legalName ?? sc.razonSocial ?? "";
  const phone = row.phone ?? row.telefono ?? sc.phone ?? "";
  const address = row.address ?? row.direccion ?? sc.address ?? "";
  const active =
    row.active !== undefined
      ? toBool(row.active)
      : row.is_active !== undefined
      ? toBool(row.is_active)
      : row.enabled !== undefined
      ? toBool(row.enabled)
      : row.status !== undefined
      ? toBool(row.status)
      : sc.active !== undefined
      ? toBool(sc.active)
      : false;

  return {
    id: row.id,
    slug: row.slug ?? sc.slug ?? "",
    name: row.name ?? sc.name ?? "",
    legalName,
    rfc: row.rfc ?? sc.rfc ?? "",
    email: row.email ?? sc.email ?? "",
    phone,
    address,
    active,
    settings: s,
  };
}

function mergeSettings(current: any, dto: CompanyDTO) {
  const s = current?.settings ?? {};
  const sc = s.company ?? {};
  return {
    ...s,
    company: {
      ...sc,
      name: dto.name ?? sc.name,
      slug: dto.slug ?? sc.slug,
      legalName: dto.legalName ?? sc.legalName,
      rfc: dto.rfc ?? sc.rfc,
      email: dto.email ?? sc.email,
      phone: dto.phone ?? sc.phone,
      address: dto.address ?? sc.address,
      active: dto.active ?? sc.active,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param");

    const db = dbOrThrow();
    const table = await pickCompanyTable(db);
    if (!table) return bad(404, "Companies table not found");

    // Traemos TODO y normalizamos (select("*") evita fallar por columnas que no existan)
    const { data, error } = await db
      .from(table)
      .select("*")
      .ilike("slug", slug)
      .single();

    if (error) return bad(400, error.message);
    if (!data) return bad(404, `Company not found for slug '${slug}'`);

    const dto = normalizeCompany(data);
    return NextResponse.json(dto);
  } catch (e: any) {
    return bad(500, e?.message || "Server error");
  }
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  try {
    const slug = (new URL(req.url).searchParams.get("company") || "").toLowerCase();
    if (!slug) return bad(400, "Missing 'company' param", res.headers);

    // Exigimos sesión para escribir
    const supabaseSSR = ssrClient(req, res);
    const { data: sess } = await supabaseSSR.auth.getSession();
    if (!sess?.session) return bad(401, "Not authenticated", res.headers);

    const payload = await req.json().catch(() => ({}));
    if (!payload || typeof payload !== "object") {
      return bad(400, "Invalid payload", res.headers);
    }

    const incoming: CompanyDTO = {
      id: payload.id,
      slug,
      name: payload.name ?? "",
      legalName: payload.legalName ?? payload.razonSocial ?? "",
      rfc: payload.rfc ?? "",
      email: payload.email ?? "",
      phone: payload.phone ?? payload.telefono ?? "",
      address: payload.address ?? payload.direccion ?? "",
      active: payload.active !== undefined ? Boolean(payload.active) : undefined,
    };

    const db = dbOrThrow();
    const table = await pickCompanyTable(db);
    if (!table) return bad(404, "Companies table not found", res.headers);

    // Traemos la fila completa para saber qué columnas existen
    const { data: current, error: e1 } = await db
      .from(table)
      .select("*")
      .ilike("slug", slug)
      .single();

    if (e1) return bad(400, e1.message, res.headers);
    if (!current) return bad(404, `Company not found for slug '${slug}'`, res.headers);

    // Construimos el UPDATE solo con columnas que existen en la fila actual
    const update: any = {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(current, k);

    if (has("name")) update.name = incoming.name;

    if (incoming.legalName !== undefined) {
      if (has("legal_name")) update.legal_name = incoming.legalName;
      else if (has("razon_social")) update.razon_social = incoming.legalName;
    }
    if (incoming.rfc !== undefined && has("rfc")) update.rfc = incoming.rfc;
    if (incoming.email !== undefined && has("email")) update.email = incoming.email;

    if (incoming.phone !== undefined) {
      if (has("phone")) update.phone = incoming.phone;
      else if (has("telefono")) update.telefono = incoming.phone;
    }
    if (incoming.address !== undefined) {
      if (has("address")) update.address = incoming.address;
      else if (has("direccion")) update.direccion = incoming.address;
    }
    if (incoming.active !== undefined) {
      if (has("active")) update.active = incoming.active;
      else if (has("is_active")) update.is_active = incoming.active;
      else if (has("enabled")) update.enabled = incoming.active;
      else if (has("status")) update.status = incoming.active ? "active" : "inactive";
    }

    // Siempre guardamos también en settings.company (canónica)
    update.settings = mergeSettings(current, incoming);

    const { error: e2 } = await db.from(table).update(update).eq("id", current.id);
    if (e2) return bad(400, e2.message, res.headers);

    return NextResponse.json({ ok: true }, { headers: res.headers });
  } catch (e: any) {
    return bad(500, e?.message || "Server error", res.headers);
  }
}
