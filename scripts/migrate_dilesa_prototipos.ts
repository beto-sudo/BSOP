/**
 * migrate_dilesa_prototipos.ts
 *
 * Carga dilesa.prototipos desde Coda.
 *
 *   grid-NHzaJFfJAa  Prototipos → dilesa.prototipos
 *
 * Nota de la shape real (2026-04-23): esta tabla en Coda sólo tiene 3 columnas:
 *   - Nombre (o row.name) — display
 *   - Prototipo-Viejo      — mismo valor que display
 *   - Clasificación Inmobiliaria (lookup → nombre)
 *
 * El costo/valor por prototipo no vive aquí — está en `Fraccionamiento-Prototipo`
 * con contexto por proyecto. Por eso el master en BSOP queda "fino" y los
 * costos aterrizan en `dilesa.fraccionamiento_prototipo.precio_venta` vía el
 * script correspondiente.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_prototipos.ts
 *   npx tsx scripts/migrate_dilesa_prototipos.ts
 */

import { CodaClient, buildColumnMap, pick, str } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadEnv,
  printReport,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CODA_TABLE_ID = 'grid-NHzaJFfJAa';

export async function migratePrototipos(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.prototipos');

  console.log(`\n🚀 Prototipos — Coda ${CODA_TABLE_ID} → dilesa.prototipos`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  // Cache clasificaciones por nombre (el lookup de Coda devuelve display name)
  const { data: clasifRows } = await supabase
    .schema('dilesa' as any)
    .from('clasificacion_inmobiliaria')
    .select('id, nombre')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const clasifByName = new Map<string, string>();
  for (const c of clasifRows ?? []) clasifByName.set(c.nombre.toLowerCase().trim(), c.id);
  console.log(`  clasificaciones en BSOP: ${clasifByName.size}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID);
  report.fetched = rows.length;
  console.log(`  fetched: ${rows.length} rows\n`);

  for (const row of rows) {
    const v = row.values;

    // row.name es la columna display (= "Prototipo-Viejo") con nombres únicos
    // como ISA/ISB/RMA/EQ⚙️. La columna "Nombre" tiene códigos cortos A/B/C/D
    // que colisionan entre sí — NO usar como identidad.
    const nombre = str(row.name) ?? str(pick(v, colMap, 'prototipo-viejo', 'id prototipo', 'nombre'));
    if (!nombre) {
      report.warnings.push(`row ${row.id}: empty nombre`);
      report.skipped++;
      continue;
    }

    const clasifRaw = str(pick(v, colMap, 'clasificación inmobiliaria', 'clasificacion inmobiliaria'));
    let clasificacion_inmobiliaria_id: string | null = null;
    if (clasifRaw) {
      clasificacion_inmobiliaria_id = clasifByName.get(clasifRaw.toLowerCase().trim()) ?? null;
      if (!clasificacion_inmobiliaria_id) {
        report.warnings.push(`prototipo "${nombre}": clasificación "${clasifRaw}" no encontrada`);
      }
    }

    const payload = {
      empresa_id: env.empresaId,
      nombre,
      codigo: nombre, // evita colisión NULLS NOT DISTINCT en prototipos_codigo_empresa_uk
      clasificacion_inmobiliaria_id,
      coda_row_id: row.id,
    };

    if (env.dryRun) {
      console.log(`  [DRY] ${nombre} | clasif=${clasifRaw ?? '-'}→${clasificacion_inmobiliaria_id ? clasificacion_inmobiliaria_id.slice(0, 8) : '·'}`);
      report.created++;
      continue;
    }

    const { data: existing } = await supabase
      .schema('dilesa' as any)
      .from('prototipos')
      .select('id')
      .eq('empresa_id', env.empresaId)
      .eq('coda_row_id', row.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('prototipos')
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
        .from('prototipos')
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
  migratePrototipos().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
