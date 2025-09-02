// lib/repos/companyRepo.ts
import { dbOrThrow } from "@/lib/db";

const TABLE_CANDIDATES = ["Company", "company", "companies"] as const;
let cachedTable: string | null = null;

function coerceStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
function toBool(x: any): boolean {
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return x === 1;
  if (typeof x === "string") {
    const v = x.toLowerCase();
    return ["1","true","activo","active","enabled","yes","sí","si"].includes(v);
  }
  return false;
}

export type CompanyDTO = {
  id: string | number;
  slug: string;
  name: string;         // comercial
  legalName?: string;   // razón social
  tradeName?: string;   // alias comercial si lo usas aparte
  rfc?: string;
  email?: string;
  phone?: string;
  address?: string;     // UI envía string; si la columna es jsonb la parseamos aquí
  active?: boolean;     // checkbox del UI
  settings?: any;
};

async function resolveCompanyTable(): Promise<string> {
  if (cachedTable) return cachedTable;
  const db = dbOrThrow();
  for (const t of TABLE_CANDIDATES) {
    const { error } = await db.from(t).select("id").limit(1);
    if (!error) { cachedTable = t; return t; }
  }
  throw new Error("Companies table not found (Company/company/companies)");
}

function normalize(row: any): CompanyDTO {
  const s  = row?.settings ?? {};
  const sc = s?.company ?? {};

  // nombre comercial priorizamos tradeName si lo usas, si no name
  const name = row.tradeName ?? row.name ?? sc.name ?? "";

  const legalName =
    row.legalName ?? row.legal_name ?? row.razon_social ?? sc.legalName ?? sc.razonSocial ?? "";

  const address = coerceStr(row.address ?? row.direccion ?? sc.address ?? "");
  const phone   = row.phone ?? sc.phone ?? "";
  const active  =
    row.active !== undefined ? toBool(row.active)
    : row.isActive !== undefined ? toBool(row.isActive)
    : row.is_active !== undefined ? toBool(row.is_active)
    : sc.active !== undefined ? toBool(sc.active)
    : true;

  return {
    id: row.id,
    slug: row.slug ?? sc.slug ?? "",
    name,
    tradeName: row.tradeName ?? sc.tradeName,
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
  const s  = current?.settings ?? {};
  const sc = s.company ?? {};
  return {
    ...s,
    company: {
      ...sc,
      name: dto.name ?? sc.name,
      tradeName: dto.tradeName ?? sc.tradeName,
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

export async function listCompanies() {
  const db = dbOrThrow();
  const table = await resolveCompanyTable();
  // name + slug sí existen en tu schema
  const { data, error } = await db.from(table).select("id,name,tradeName,slug").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.tradeName ?? r.name ?? "",
    slug: r.slug ?? (r.name ? r.name.toLowerCase().replace(/[^a-z0-9]+/g,"-") : String(r.id)),
  }));
}

export async function getCompanyBySlug(slug: string): Promise<CompanyDTO> {
  const db = dbOrThrow();
  const table = await resolveCompanyTable();
  const { data, error } = await db.from(table).select("*").ilike("slug", slug).single();
  if (error) throw error;
  return normalize(data);
}

/**
 * Update “a prueba de balas” para tu schema:
 * - Mapea camelCase reales: legalName, tradeName, isActive, address(jsonb).
 * - Si la columna existe en la fila, se actualiza; si no, se ignora.
 * - address: si es jsonb y el UI manda string, intentamos JSON.parse.
 * - actualiza 'active' e 'isActive' si ambas existen (se mantienen consistentes).
 * - settings: solo si existe la columna.
 * - Si el patch queda vacío, no disparo update y devuelvo ok.
 */
export async function updateCompanyBySlug(slug: string, patch: Partial<CompanyDTO>) {
  const db = dbOrThrow();
  const table = await resolveCompanyTable();

  const { data: current, error: e1 } = await db.from(table).select("*").ilike("slug", slug).single();
  if (e1) throw e1;

  const has = (k: string) => Object.prototype.hasOwnProperty.call(current, k);
  const upd: any = {};

  // Nombre comercial: si existe tradeName lo sincronizamos también
  if (patch.name !== undefined) {
    if (has("name"))      upd.name = patch.name;
    if (has("tradeName")) upd.tradeName = patch.name;
  }
  if (patch.tradeName !== undefined) {
    if (has("tradeName")) upd.tradeName = patch.tradeName;
    // y si no hay tradeName, al menos name
    else if (has("name")) upd.name = patch.tradeName;
  }

  if (patch.legalName !== undefined) {
    if (has("legalName"))    upd.legalName = patch.legalName;
    else if (has("legal_name")) upd.legal_name = patch.legalName;
    else if (has("razon_social")) upd.razon_social = patch.legalName;
  }

  if (patch.rfc !== undefined && has("rfc")) upd.rfc = patch.rfc;
  if (patch.email !== undefined && has("email")) upd.email = patch.email;
  if (patch.phone !== undefined && has("phone")) upd.phone = patch.phone;

  if (patch.address !== undefined) {
    const looksJsonb =
      (has("address")   && typeof current.address   === "object" && current.address   !== null) ||
      (has("direccion") && typeof current.direccion === "object" && current.direccion !== null);

    let value: any = patch.address;
    if (looksJsonb && typeof patch.address === "string") {
      try { value = JSON.parse(patch.address); } catch { value = patch.address; }
    }
    if (has("address"))   upd.address   = value;
    if (has("direccion")) upd.direccion = value;
  }

  if (patch.active !== undefined) {
    // Actualizamos ambos si existen, para mantener coherencia
    if (has("active"))   upd.active   = patch.active;
    if (has("isActive")) upd.isActive = patch.active;
    if (has("is_active")) upd.is_active = patch.active;
  }

  // settings solo si existe
  if (has("settings")) {
    upd.settings = mergeSettings(current, {
      id: current.id,
      slug: current.slug ?? slug,
      name: patch.name ?? current.name ?? current.tradeName ?? "",
      tradeName: patch.tradeName,
      legalName: patch.legalName,
      rfc: patch.rfc,
      email: patch.email,
      phone: patch.phone,
      address: patch.address,
      active: patch.active,
    });
  }

  if (Object.keys(upd).length === 0) {
    return { ok: true, noop: true };
  }

  const { error: e2 } = await db.from(table).update(upd).eq("id", current.id);
  if (e2) throw e2;
  return { ok: true };
}
