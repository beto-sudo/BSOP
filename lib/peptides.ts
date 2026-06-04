import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

// Base de info de sourcing de péptidos — iniciativa sanren-peptides.
// Lee peptides.* con el cliente service-role (igual que lib/protocolo.ts);
// las tablas tienen RLS deny-all, así que el único acceso es server-side.
// El schema `peptides` no está en los tipos generados todavía (se agregó a
// db:types para el próximo auto-regen); de mientras casteamos .schema('peptides').

export type VendorEstado = 'activo' | 'removido' | 'warning';

export type Peptido = {
  id: string;
  nombre: string;
  aliases: string[] | null;
  clase: string | null;
  descripcion: string | null;
  protocolo_tipico: string | null;
  reconstitucion: string | null;
  cautelas: string | null;
  fuente: string | null;
};

export type Vendor = {
  id: string;
  codigo: string;
  nombre: string | null;
  estado: VendorEstado;
  precio_mg: number | null;
  precio_mg_sale: number | null;
  moneda: string | null;
  us_warehouse: boolean | null;
  china_warehouse: boolean | null;
  eu_warehouse: boolean | null;
  metodos_pago: string | null;
  primer_contacto: string | null;
  garantia: string | null;
  notas: string | null;
  nota_personal: string | null;
  fuente_url: string | null;
  imported_at: string | null;
};

export type Test = {
  id: string;
  vendor_codigo: string | null;
  peptido: string | null;
  test_date: string | null;
  batch: string | null;
  expected_mass_mg: number | null;
  mass_mg: number | null;
  purity_pct: number | null;
  tfa: string | null;
  endotoxin: string | null;
  test_lab: string | null;
  file_name: string | null;
  lab_url: string | null;
};

export type Insumo = {
  id: string;
  proveedor: string;
  url: string | null;
  productos: string | null;
};

export type Nota = {
  id: string;
  titulo: string | null;
  cuerpo: string | null;
  tags: string[] | null;
  tipo: string | null;
  peptido: string | null;
  vendor_codigo: string | null;
  fuente: string | null;
  fecha: string | null;
};

export type PeptidesData = {
  peptidos: Peptido[];
  vendors: Vendor[];
  tests: Test[];
  insumos: Insumo[];
  notas: Nota[];
  asOf: string | null;
  errors: string[];
};

const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getPeptidesData(): Promise<PeptidesData> {
  const admin = getSupabaseAdminClient();
  const empty: PeptidesData = {
    peptidos: [],
    vendors: [],
    tests: [],
    insumos: [],
    notas: [],
    asOf: null,
    errors: [],
  };
  if (!admin) {
    return { ...empty, errors: ['Supabase service role key is not configured.'] };
  }

  // El schema `peptides` aún no está en los tipos generados — cast puntual.
  const pep = admin.schema('peptides' as never) as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts?: { ascending?: boolean; nullsFirst?: boolean }
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };

  const [peptidosRes, vendorsRes, testsRes, insumosRes, notasRes] = await Promise.all([
    pep.from('peptidos').select('*').order('nombre', { ascending: true }),
    pep.from('vendors').select('*').order('codigo', { ascending: true }),
    pep.from('tests').select('*').order('purity_pct', { ascending: false, nullsFirst: false }),
    pep.from('insumos').select('*').order('proveedor', { ascending: true }),
    pep.from('notas').select('*').order('fecha', { ascending: false, nullsFirst: false }),
  ]);

  const errors: string[] = [];
  const grab = <T>(
    res: { data: unknown[] | null; error: { message: string } | null },
    label: string
  ): T[] => {
    if (res.error) {
      errors.push(getSupabaseErrorMessage(res.error, `No se pudo cargar ${label}.`));
      return [];
    }
    return (res.data ?? []) as T[];
  };

  const peptidos = grab<Peptido>(peptidosRes, 'el catálogo');
  const vendorsRaw = grab<Record<string, unknown>>(vendorsRes, 'los vendors');
  const testsRaw = grab<Record<string, unknown>>(testsRes, 'los tests');
  const insumos = grab<Insumo>(insumosRes, 'los insumos');
  const notas = grab<Nota>(notasRes, 'las notas');

  const vendors: Vendor[] = vendorsRaw.map((v) => ({
    ...(v as unknown as Vendor),
    precio_mg: toNum(v.precio_mg),
    precio_mg_sale: toNum(v.precio_mg_sale),
  }));

  const tests: Test[] = testsRaw.map((t) => ({
    ...(t as unknown as Test),
    expected_mass_mg: toNum(t.expected_mass_mg),
    mass_mg: toNum(t.mass_mg),
    purity_pct: toNum(t.purity_pct),
  }));

  // "as of" = el imported_at más reciente entre vendors (todos comparten el del run).
  const asOf =
    vendors.reduce<string | null>(
      (max, v) => (v.imported_at && (!max || v.imported_at > max) ? v.imported_at : max),
      null
    ) ?? null;

  return { peptidos, vendors, tests, insumos, notas, asOf, errors };
}
