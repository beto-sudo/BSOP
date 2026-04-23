/**
 * Utilidades compartidas por los scripts `migrate_dilesa_*.ts` del sprint
 * dilesa-1b y siguientes. No es para import desde la app Next.js — vive bajo
 * `scripts/lib/` para evitar empaquetarse con el bundle de producción.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CODA_DOC_ID = 'ZNxWl_DI2D';

export const DILESA_EMPRESA_ID_DEFAULT = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

export interface MigrationEnv {
  codaApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  empresaId: string;
  dryRun: boolean;
  continueOnError: boolean;
}

export function loadEnv(): MigrationEnv {
  const codaApiKey = process.env.CODA_API_KEY ?? '';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const empresaId = process.env.DILESA_EMPRESA_ID ?? DILESA_EMPRESA_ID_DEFAULT;
  const dryRun = process.env.DRY_RUN === '1';
  const continueOnError = process.env.CONTINUE_ON_ERROR === '1';

  if (!codaApiKey) throw new Error('CODA_API_KEY is required');
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!empresaId) throw new Error('DILESA_EMPRESA_ID is required');

  return {
    codaApiKey,
    supabaseUrl,
    supabaseServiceKey,
    empresaId,
    dryRun,
    continueOnError,
  };
}

export function supaAdmin(env: MigrationEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Genera un slug ascii-safe desde un nombre (para usar como `codigo` cuando
 * Coda no tiene una columna código propia).
 */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Tipo de reporte por tabla que consume el orquestador. */
export interface TableReport {
  table: string;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

export function emptyReport(table: string): TableReport {
  return { table, fetched: 0, created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };
}

export function printReport(r: TableReport): void {
  const line = '─'.repeat(65);
  console.log(`\n${line}\n${r.table}\n${line}`);
  console.log(
    `  fetched=${r.fetched}  created=${r.created}  updated=${r.updated}  skipped=${r.skipped}`
  );
  if (r.warnings.length) {
    console.log(`  warnings (${r.warnings.length}):`);
    for (const w of r.warnings.slice(0, 20)) console.log(`    ⚠ ${w}`);
    if (r.warnings.length > 20) console.log(`    … (+${r.warnings.length - 20} more)`);
  }
  if (r.errors.length) {
    console.log(`  errors (${r.errors.length}):`);
    for (const e of r.errors.slice(0, 20)) console.log(`    ✗ ${e}`);
    if (r.errors.length > 20) console.log(`    … (+${r.errors.length - 20} more)`);
  }
}

/**
 * Construye un mapa `coda_row_id → id` para lookups de FK post-migración.
 * Se apoya en el índice único `(empresa_id, coda_row_id)` de cada tabla.
 */
export async function loadCodaIdMap(
  supabase: SupabaseClient,
  schema: 'dilesa' | 'erp',
  table: string,
  empresaId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .schema(schema as any)
    .from(table)
    .select('id, coda_row_id')
    .eq('empresa_id', empresaId)
    .not('coda_row_id', 'is', null);

  if (error) {
    throw new Error(`loadCodaIdMap ${schema}.${table}: ${error.message}`);
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.coda_row_id) map.set(row.coda_row_id, row.id);
  }
  return map;
}

/**
 * Carga los empleados activos de una empresa y construye varias tablas de
 * lookup por nombre (fullname, solo nombre) para resolver "Responsable" de
 * Coda → `erp.empleados.id`.
 */
export interface EmpleadoLookup {
  nameToId: Map<string, string>;
  entries: { full: string; id: string }[];
}

export async function loadEmpleadosLookup(
  supabase: SupabaseClient,
  empresaId: string
): Promise<EmpleadoLookup> {
  const { data, error } = await supabase
    .schema('erp' as any)
    .from('empleados')
    .select('id, persona:persona_id(nombre, apellido_paterno)')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);

  if (error) throw new Error(`loadEmpleadosLookup: ${error.message}`);

  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const nameToId = new Map<string, string>();
  const entries: { full: string; id: string }[] = [];

  for (const e of data ?? []) {
    const p = (e as any).persona;
    if (!p) continue;
    const full = normalize([p.nombre, p.apellido_paterno].filter(Boolean).join(' '));
    if (!full) continue;
    nameToId.set(full, e.id);
    entries.push({ full, id: e.id });
    if (p.nombre) nameToId.set(normalize(p.nombre), e.id);
  }

  return { nameToId, entries };
}

/**
 * Resuelve un nombre de Coda (texto libre) a empleado_id usando estrategias
 * en cascada: exacto → prefix match → nombre solo. Devuelve `null` si no hay
 * match (el caller decide qué hacer).
 */
export function resolveEmpleado(lookup: EmpleadoLookup, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const key = normalize(raw);

  const exact = lookup.nameToId.get(key);
  if (exact) return exact;

  const starts = lookup.entries.find((e) => key.startsWith(e.full));
  if (starts) return starts.id;

  const startsRev = lookup.entries.find((e) => e.full.startsWith(key));
  if (startsRev) return startsRev.id;

  const firstName = key.split(' ')[0];
  const firstOnly = lookup.nameToId.get(firstName);
  if (firstOnly) return firstOnly;

  return null;
}
