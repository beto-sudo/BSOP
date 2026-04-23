/**
 * migrate_dilesa_proyectos.ts
 *
 * Carga dilesa.proyectos desde Coda.
 *
 *   grid-SlvkPAfZNE  Proyectos → dilesa.proyectos
 *
 * Nota de la shape real (2026-04-23): la tabla Coda `Proyectos` **no tiene**
 * columnas Terreno ni Anteproyecto ni Tipo de Proyecto como lookups. La
 * relación Terreno→Proyecto se deriva indirectamente: cada proyecto suele
 * tener un anteproyecto homónimo (mismo nombre) en `Anteproyectos`, el cual
 * sí vincula terreno_id. Para proyectos "legacy" sin anteproyecto equivalente,
 * se salta con warning (terreno_id es NOT NULL en el schema).
 *
 * Columnas reales en Coda relevantes:
 *   - ID Proyecto (display)       → nombre
 *   - Abreviación                 → codigo
 *   - Clasificación Inmobiliaria  → (no va a proyectos; vive en prototipos)
 *   - Area Vendible M²            → area_vendible_m2
 *   - Areas Verdes M²             → areas_verdes_m2
 *   - Total de Lotes              → cantidad_lotes_total
 *   - Fecha Licencia Fraccionamiento → fecha_inicio (proxy)
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_proyectos.ts
 *   npx tsx scripts/migrate_dilesa_proyectos.ts
 */

import { CodaClient, buildColumnMap, dateStr, int, num, pick, str } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadEnv,
  printReport,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CODA_TABLE_ID = 'grid-SlvkPAfZNE';

export async function migrateProyectos(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.proyectos');

  console.log(`\n🚀 Proyectos — Coda ${CODA_TABLE_ID} → dilesa.proyectos`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  // Load anteproyectos de BSOP para derivar terreno_id por matching de nombre
  const { data: apRows } = await supabase
    .schema('dilesa' as any)
    .from('anteproyectos')
    .select('id, nombre, terreno_id, tipo_proyecto_id')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const apByName = new Map<
    string,
    { id: string; terreno_id: string; tipo_proyecto_id: string | null }
  >();
  for (const ap of apRows ?? []) {
    apByName.set(ap.nombre.toLowerCase().trim(), {
      id: ap.id,
      terreno_id: ap.terreno_id,
      tipo_proyecto_id: ap.tipo_proyecto_id,
    });
  }
  console.log(`  anteproyectos indexados por nombre: ${apByName.size}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID);
  report.fetched = rows.length;
  console.log(`  fetched: ${rows.length} rows\n`);

  for (const row of rows) {
    const v = row.values;

    const nombre = str(pick(v, colMap, 'id proyecto', 'nombre', 'name')) ?? row.name;
    if (!nombre) {
      report.warnings.push(`row ${row.id}: empty nombre`);
      report.skipped++;
      continue;
    }

    // Match anteproyecto por nombre (exacto primero, luego prefix)
    const nombreKey = nombre.toLowerCase().trim();
    let ap = apByName.get(nombreKey);
    if (!ap) {
      // Fallback: Coda proyecto "Ampliación Lomas de los Encinos" vs anteproyecto
      // "Ampliación Lomas de los Encinos" — mismo. Pero también casos donde el
      // proyecto es un derivado ("Loma Verde 2" → anteproyecto "Loma Verde").
      for (const [apKey, val] of apByName) {
        if (nombreKey.startsWith(apKey) || apKey.startsWith(nombreKey)) {
          ap = val;
          break;
        }
      }
    }
    if (!ap) {
      report.warnings.push(`proyecto "${nombre}": sin anteproyecto match (terreno_id NOT NULL requerido)`);
      report.skipped++;
      continue;
    }

    const codigo = str(pick(v, colMap, 'abreviación', 'abreviacion', 'codigo', 'code'));
    const area_vendible_m2 = num(pick(v, colMap, 'area vendible m²', 'area vendible m2', 'area vendible'));
    const areas_verdes_m2 = num(pick(v, colMap, 'areas verdes m²', 'areas verdes m2', 'áreas verdes m²', 'áreas verdes m2'));
    const cantidad_lotes_total = int(pick(v, colMap, 'total de lotes', 'total lotes'));
    const fecha_inicio = dateStr(
      pick(v, colMap, 'fecha licencia fraccionamiento', 'fecha inicio', 'fecha de inicio')
    );

    // Capex
    const costo_urbanizacion_raw = num(pick(v, colMap, 'costo de urbanización', 'costo de urbanizacion', 'costo urbanización'));
    const costo_terreno_raw = num(pick(v, colMap, 'costo terreno'));
    const presupuesto_total =
      (costo_urbanizacion_raw ?? 0) + (costo_terreno_raw ?? 0) || null;

    const payload = {
      empresa_id: env.empresaId,
      nombre,
      codigo,
      terreno_id: ap.terreno_id,
      anteproyecto_id: ap.id,
      tipo_proyecto_id: ap.tipo_proyecto_id,
      fecha_inicio,
      area_vendible_m2,
      areas_verdes_m2,
      cantidad_lotes_total,
      presupuesto_total,
      coda_row_id: row.id,
    };

    if (env.dryRun) {
      console.log(`  [DRY] ${nombre} (codigo=${codigo ?? '-'}) | ap=${ap.id.slice(0, 8)} terreno=${ap.terreno_id.slice(0, 8)} | lotes=${cantidad_lotes_total ?? '-'}`);
      report.created++;
      continue;
    }

    const { data: existing } = await supabase
      .schema('dilesa' as any)
      .from('proyectos')
      .select('id')
      .eq('empresa_id', env.empresaId)
      .eq('coda_row_id', row.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('proyectos')
        .update(payload)
        .eq('id', existing.id);
      if (error) {
        report.errors.push(`${nombre}: ${error.message}`);
        if (!env.continueOnError) throw new Error(error.message);
      } else {
        report.updated++;
        console.log(`  ✓ updated: ${nombre}`);
      }
    } else {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('proyectos')
        .insert(payload);
      if (error) {
        report.errors.push(`${nombre}: ${error.message}`);
        if (!env.continueOnError) throw new Error(error.message);
      } else {
        report.created++;
        console.log(`  + created: ${nombre}`);
      }
    }
  }

  printReport(report);
  return report;
}

if (require.main === module) {
  migrateProyectos().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
