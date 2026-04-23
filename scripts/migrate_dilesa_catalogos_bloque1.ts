/**
 * migrate_dilesa_catalogos_bloque1.ts
 *
 * Carga los 2 catálogos prerequisito del backbone bloque 1 desde el doc
 * Coda DILESA (ZNxWl_DI2D):
 *
 *   grid-_eUhoDDi9d  Clasificación Inmobiliaria → dilesa.clasificacion_inmobiliaria
 *   grid-ow541k7Dws  Tipo de Proyecto            → dilesa.tipo_proyecto
 *
 * Idempotente (upsert por `coda_row_id`). Ver ADR `supabase/adr/001_dilesa_schema.md`.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_catalogos_bloque1.ts
 *   npx tsx scripts/migrate_dilesa_catalogos_bloque1.ts
 */

import { CodaClient, buildColumnMap, pick, str } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadEnv,
  printReport,
  slugify,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CATALOGOS = [
  {
    codaTableId: 'grid-_eUhoDDi9d',
    label: 'Clasificación Inmobiliaria',
    bsopTable: 'clasificacion_inmobiliaria',
  },
  {
    codaTableId: 'grid-ow541k7Dws',
    label: 'Tipo de Proyecto',
    bsopTable: 'tipo_proyecto',
  },
] as const;

export async function migrateCatalogosBloque1(): Promise<TableReport[]> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);

  console.log(`\n🚀 Catálogos bloque 1 — Doc ${CODA_DOC_ID}`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  const reports: TableReport[] = [];

  for (const cat of CATALOGOS) {
    const report = emptyReport(`dilesa.${cat.bsopTable}`);

    const cols = await coda.listColumns(CODA_DOC_ID, cat.codaTableId);
    const colMap = buildColumnMap(cols);
    const rows = await coda.listRowsAll(CODA_DOC_ID, cat.codaTableId);
    report.fetched = rows.length;

    console.log(`\n─── ${cat.label} (${rows.length} rows) ───`);

    let orden = 0;
    for (const row of rows) {
      orden++;
      const nombre =
        str(pick(row.values, colMap, 'nombre', 'name', 'clasificación', 'tipo', cat.label)) ??
        row.name;
      if (!nombre) {
        report.warnings.push(`row ${row.id}: empty nombre`);
        report.skipped++;
        continue;
      }

      const codigoRaw = str(pick(row.values, colMap, 'código', 'codigo', 'code', 'clave'));
      const descripcion = str(
        pick(row.values, colMap, 'descripción', 'descripcion', 'notas', 'observaciones')
      );
      const codigo = codigoRaw ?? slugify(nombre);

      const payload = {
        empresa_id: env.empresaId,
        codigo,
        nombre,
        descripcion,
        orden,
        activo: true,
        coda_row_id: row.id,
      };

      if (env.dryRun) {
        console.log(`  [DRY] ${nombre} (codigo=${codigo})`);
        report.created++;
        continue;
      }

      const { data: existing } = await supabase
        .schema('dilesa' as any)
        .from(cat.bsopTable)
        .select('id')
        .eq('empresa_id', env.empresaId)
        .eq('coda_row_id', row.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .schema('dilesa' as any)
          .from(cat.bsopTable)
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
          .from(cat.bsopTable)
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

    reports.push(report);
    printReport(report);
  }

  return reports;
}

// Permite correrse directo: `npx tsx scripts/migrate_dilesa_catalogos_bloque1.ts`
if (require.main === module) {
  migrateCatalogosBloque1().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
