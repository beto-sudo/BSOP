/**
 * migrate_dilesa_anteproyectos_prototipos_ref.ts
 *
 * Carga la M:N anteproyecto ↔ prototipo de referencia. En Coda no es una
 * tabla separada: es una columna de lookup multi-valor en la tabla
 * Anteproyectos (`Prototipos Referencia para Analisis`).
 *
 *   grid-918aH4OlMi  Anteproyectos
 *     columna: "Prototipos Referencia para Analisis" (lookup multi → display names)
 *     → dilesa.anteproyectos_prototipos_referencia
 *
 * Con valueFormat `simple`, el valor viene como string comma-separated de
 * display names (ej. "ISA,ISB,ISC"). Parseamos y hacemos lookup por nombre
 * en `dilesa.prototipos`.
 *
 * Requiere anteproyectos y prototipos cargados.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_anteproyectos_prototipos_ref.ts
 *   npx tsx scripts/migrate_dilesa_anteproyectos_prototipos_ref.ts
 */

import { CodaClient, buildColumnMap, pick } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadCodaIdMap,
  loadEnv,
  printReport,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CODA_TABLE_ID_ANTEPROY = 'grid-918aH4OlMi';

/** Parsea "LDS-RMC,LDS-RMB" (lookup multi Fraccionamiento) a array de ids. */
function parseNames(v: unknown): string[] {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Coda "Prototipos Referencia para Analisis" apunta a rows de
 * Fraccionamiento-Prototipo (display name como "LDS-RMC"). El prototipo
 * master es el sufijo tras el último "-" (RMC, ISC, etc.).
 */
function extractMasterName(junctionId: string): string {
  const parts = junctionId.split('-');
  return parts[parts.length - 1].trim();
}

export async function migrateAnteproyectosPrototiposRef(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.anteproyectos_prototipos_referencia');

  console.log(`\n🚀 Anteproyectos·Prototipos (M:N ref) — Coda ${CODA_TABLE_ID_ANTEPROY}`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  const anteproyMap = await loadCodaIdMap(supabase, 'dilesa', 'anteproyectos', env.empresaId);

  // prototipos indexados por nombre (Coda ref devuelve display name)
  const { data: protoRows } = await supabase
    .schema('dilesa' as any)
    .from('prototipos')
    .select('id, nombre')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const protoByName = new Map<string, string>();
  for (const p of protoRows ?? []) protoByName.set(p.nombre.toLowerCase().trim(), p.id);
  console.log(`  anteproyectos=${anteproyMap.size}  prototipos=${protoByName.size}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID_ANTEPROY);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID_ANTEPROY);
  report.fetched = rows.length;

  for (const row of rows) {
    const anteproyecto_id = anteproyMap.get(row.id);
    if (!anteproyecto_id) {
      report.warnings.push(`anteproyecto ${row.id} (${row.name}): no encontrado en BSOP`);
      report.skipped++;
      continue;
    }

    const raw = pick(
      row.values,
      colMap,
      'prototipos referencia para analisis',
      'prototipos referencia para análisis',
      'prototipos referencia',
      'prototipos de referencia'
    );
    const names = parseNames(raw);
    if (names.length === 0) continue;

    // Dedup: un anteproyecto puede referenciar "LDS-RMA,LDS-RMB,LDS-RMC" pero
    // todos apuntan al mismo set de masters (RMA/RMB/RMC). Si dos junctions
    // reducen al mismo master, creamos UNA sola referencia.
    const masterNames = new Set(names.map(extractMasterName));

    for (const masterName of masterNames) {
      const prototipo_id = protoByName.get(masterName.toLowerCase().trim());
      if (!prototipo_id) {
        report.warnings.push(`anteproyecto ${row.name}: prototipo master "${masterName}" (de junction) no encontrado en BSOP`);
        continue;
      }

      if (env.dryRun) {
        console.log(`  [DRY] ap=${row.name} ← proto=${masterName}`);
        report.created++;
        continue;
      }

      const { data: existing } = await supabase
        .schema('dilesa' as any)
        .from('anteproyectos_prototipos_referencia')
        .select('id')
        .eq('anteproyecto_id', anteproyecto_id)
        .eq('prototipo_id', prototipo_id)
        .maybeSingle();

      if (existing) {
        report.skipped++;
        continue;
      }

      const { error } = await supabase
        .schema('dilesa' as any)
        .from('anteproyectos_prototipos_referencia')
        .insert({
          empresa_id: env.empresaId,
          anteproyecto_id,
          prototipo_id,
        });
      if (error) {
        report.errors.push(`ap=${row.name} proto=${masterName}: ${error.message}`);
        if (!env.continueOnError) throw new Error(error.message);
      } else {
        report.created++;
      }
    }
  }

  printReport(report);
  return report;
}

if (require.main === module) {
  migrateAnteproyectosPrototiposRef().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
