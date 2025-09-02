// lib/repos/companyRepo.ts
import { dbOrThrow } from "@/lib/db";

const TABLE_CANDIDATES = ["Company", "company", "companies"] as const;
let cachedTable: string | null = null;

function coerceStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function toBool(x: any): boolean {
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return x === 1;
  if (typeof x === "string") {
    const v = x.toLowerCase();
    return ["1", "true", "activo", "active", "enabled", "yes", "sí", "si"].includes(v);
  }
  return false;
}

export type CompanyDTO = {
  id: string | number;
  slug: string;
  name: string;
  legalName?: string;
  rfc?: string;
  email?: string;
  phone?: string;
  address?: string; // el front manda string (si el campo real es jsonb lo parseamos aquí)
  active?: boolean;
  settings?: any;
};

async function resolveCompanyTable(): Promise<string> {
  if (cachedTable) return cachedTable;
  const db = dbOrThrow();
  for (const t of TABLE_CANDIDATES) {
    const { error } = await db.from(t).select("id").limit(1);
    if (!error) {
      cachedTable = t;
      return t;
    }
  }
  throw new Error("Companies table not found (tried Company/company/companies)");
}

function normalize(row: any): CompanyDTO {
  const s = row?.settings ?? {};
  const sc = s?.company ?? {};

  const legalName =
    row.legal_name ?? row.razon_social ?? sc.legalName ?? sc.razonSocial ?? "";
  const phone = row.phone ?? row.telefono ?? sc.phone ?? "";
  const address = coerceStr(row.address ?? row.direccion ?? sc.address ?? "");
  const active =
    row.active !== undefined ? toBool(row.active)
    : row.is_active !== undefined ? toBool(row.is_active)
    : row.enabled !== undefined ? toBool(row.enabled)
    : row.status !== undefined ? toBool(row.status)
    : sc.active !== undefined ? toBool(sc.active)
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

export async function listCompanies(): Promise<Array<Pick<CompanyDTO, "id"|"name"|"slug">>> {
  const db = dbOrThrow();
  const table = await resolveCompanyTable();

  const q = await db.from(table).select("id,name,slug").order("name", { ascending: true });
  if (!q.error) {
    return (q.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name ?? "",
      slug: r.slug ?? (r.name ? r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : String(r.id)),
    }));
  }
  const all = await db.from(table).select("*");
  if (all.error) throw all.error;
  return (all.data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? "",
    slug: r.slug ?? (r.name ? r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : String(r.id)),
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
 * Actualización tolerante:
 * - Solo actualiza columnas que EXISTEN en la fila.
 * - Si `address/direccion` es JSONB en la DB, intentamos parsear el string del form.
 * - Si el UPDATE queda sin columnas (payload vacío), NO llama a PostgREST y regresa ok.
 * - Solo toca `settings` si la tabla tiene esa columna.
 */
export async function updateCompanyBySlug(slug: string, patch: Partial<CompanyDTO>) {
  const db = dbOrThrow();
  const table = await resolveCompanyTable();

  const { data: current, error: e1 } = await db.from(table).select("*").ilike("slug", slug).single();
  if (e1) throw e1;

  const has = (k: string) => Object.prototype.hasOwnProperty.call(current, k);
  const upd: any = {};

  if (has("name") && patch.name !== undefined) upd.name = patch.name;

  if (patch.legalName !== undefined) {
    if (has("legal_name")) upd.legal_name = patch.legalName;
    else if (has("razon_social")) upd.razon_social = patch.legalName;
  }
  if (patch.rfc !== undefined && has("rfc")) upd.rfc = patch.rfc;
  if (patch.email !== undefined && has("email")) upd.email = patch.email;

  if (patch.phone !== undefined) {
    if (has("phone")) upd.phone = patch.phone;
    else if (has("telefono")) upd.telefono = patch.phone;
  }

  if (patch.address !== undefined) {
    // Si la columna real parece JSONB (el valor actual es objeto/array), parseamos el string del form.
    const looksJsonb =
      (has("address") && typeof current.address === "object" && current.address !== null) ||
      (has("direccion") && typeof current.direccion === "object" && current.direccion !== null);

    let value: any = patch.address;
    if (looksJsonb && typeof patch.address === "string") {
      try {
        value = JSON.parse(patch.address);
      } catch {
        // si no es JSON válido, guardamos el string tal cual
        value = patch.address;
      }
    }

    if (has("address")) upd.address = value;
    else if (has("direccion")) upd.direccion = value;
  }

  if (patch.active !== undefined) {
    if (has("active")) upd.active = patch.active;
    else if (has("is_active")) upd.is_active = patch.active;
    else if (has("enabled")) upd.enabled = patch.active;
    else if (has("status")) upd.status = patch.active ? "active" : "inactive";
  }

  // Solo si la tabla TIENE columna settings
  if (has("settings")) {
    upd.settings = mergeSettings(current, {
      id: current.id,
      slug: current.slug ?? slug,
      name: patch.name ?? current.name ?? "",
      legalName: patch.legalName,
      rfc: patch.rfc,
      email: patch.email,
      phone: patch.phone,
      address: patch.address,
      active: patch.active,
    });
  }

  // Si no hay nada que actualizar (evitamos 400 por payload vacío), salimos OK
  if (Object.keys(upd).length === 0) {
    return { ok: true, noop: true };
  }

  const { error: e2 } = await db.from(table).update(upd).eq("id", current.id);
  if (e2) throw e2;
  return { ok: true };
}
