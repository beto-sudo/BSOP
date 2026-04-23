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

/** Marker para el terreno placeholder usado por anteproyectos retroactivos legacy. */
const LEGACY_TERRENO_PLACEHOLDER_NOMBRE = '⚠️ Terreno pendiente - legacy proyectos';

/**
 * Busca o crea el terreno placeholder compartido por los 6 proyectos legacy
 * de Coda sin anteproyecto/terreno asociado. Se le dejan las columnas
 * económicas y de gestión en NULL; Beto los edita y re-apunta terreno_id
 * conforme aparezcan los terrenos reales.
 */
async function getOrCreatePlaceholderTerreno(
  supabase: ReturnType<typeof import('./lib/dilesa-migrate-shared').supaAdmin>,
  empresaId: string,
  dryRun: boolean
): Promise<string | null> {
  const { data: existing } = await supabase
    .schema('dilesa' as any)
    .from('terrenos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('nombre', LEGACY_TERRENO_PLACEHOLDER_NOMBRE)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return existing.id;
  if (dryRun) return 'placeholder-dry-run';

  const { data: ins, error } = await supabase
    .schema('dilesa' as any)
    .from('terrenos')
    .insert({
      empresa_id: empresaId,
      nombre: LEGACY_TERRENO_PLACEHOLDER_NOMBRE,
      notas:
        'Placeholder generado por sprint dilesa-1b para proyectos legacy sin anteproyecto ni terreno en Coda. Reemplazar por el terreno real al editar cada anteproyecto.',
      etapa: 'por_definir',
      decision_actual: 'pendiente',
    })
    .select('id')
    .single();
  if (error) throw new Error(`placeholder terreno: ${error.message}`);
  return ins.id;
}

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

    // Match anteproyecto por nombre exacto. NO usamos prefix match: "Loma Verde 2"
    // no debe compartir anteproyecto con "Loma Verde" — son proyectos distintos
    // aunque nombres similares. Si no hay match exacto, se crea retroactivo.
    const nombreKey = nombre.toLowerCase().trim();
    let ap = apByName.get(nombreKey);
    if (!ap) {
      // Proyecto legacy sin anteproyecto homónimo en Coda. Creamos un
      // anteproyecto retroactivo en BSOP apuntando al terreno placeholder,
      // para que el proyecto tenga `terreno_id` (NOT NULL) y quede linkeado
      // a un anteproyecto. Beto re-apunta al terreno real al editarlo.
      if (env.dryRun) {
        console.log(`  [DRY] ${nombre}: sin anteproyecto match → crearía retroactivo con terreno placeholder`);
        // Marcamos como creado en reporte para DRY, pero sin persistir.
        report.created++;
        continue;
      }

      const placeholderTerrenoId = await getOrCreatePlaceholderTerreno(
        supabase,
        env.empresaId,
        env.dryRun
      );
      if (!placeholderTerrenoId) {
        report.errors.push(`proyecto "${nombre}": no se pudo obtener placeholder terreno`);
        if (!env.continueOnError) throw new Error('placeholder terreno failed');
        report.skipped++;
        continue;
      }

      const { data: newAp, error: newApErr } = await supabase
        .schema('dilesa' as any)
        .from('anteproyectos')
        .insert({
          empresa_id: env.empresaId,
          nombre,
          clave_interna: nombre,
          terreno_id: placeholderTerrenoId,
          estado: 'en_tramite', // asumimos convertido después; post-pass upgradea
          notas:
            'Anteproyecto retroactivo generado por sprint dilesa-1b — el proyecto existía en Coda sin anteproyecto homónimo. Re-apuntar terreno_id al real cuando esté definido.',
          decision_actual: 'Definir terreno real',
        })
        .select('id, terreno_id, tipo_proyecto_id')
        .single();
      if (newApErr) {
        report.errors.push(`proyecto "${nombre}": crear anteproyecto retroactivo — ${newApErr.message}`);
        if (!env.continueOnError) throw new Error(newApErr.message);
        report.skipped++;
        continue;
      }
      ap = {
        id: newAp.id,
        terreno_id: newAp.terreno_id,
        tipo_proyecto_id: newAp.tipo_proyecto_id,
      };
      apByName.set(nombreKey, ap);
      report.warnings.push(`proyecto "${nombre}": anteproyecto retroactivo creado con terreno placeholder`);
      console.log(`  + anteproyecto retroactivo para "${nombre}" → ap=${ap.id.slice(0, 8)}`);
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
