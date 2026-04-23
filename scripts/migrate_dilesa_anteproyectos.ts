/**
 * migrate_dilesa_anteproyectos.ts
 *
 * Carga dilesa.anteproyectos desde Coda. Requiere terrenos y tipo_proyecto
 * ya cargados.
 *
 *   grid-918aH4OlMi  Anteproyectos → dilesa.anteproyectos
 *
 * Lookups en Coda vienen como display names con valueFormat `simple`. Se
 * resuelven a BSOP id por nombre.
 *
 * Los cálculos (aprovechamiento, utilidad, margen, etc.) viven en la vista
 * v_anteproyectos_analisis — no se migran.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_anteproyectos.ts
 *   npx tsx scripts/migrate_dilesa_anteproyectos.ts
 */

import { CodaClient, buildColumnMap, dateStr, firstUrl, int, num, pick, str } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadEmpleadosLookup,
  loadEnv,
  printReport,
  resolveEmpleado,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CODA_TABLE_ID = 'grid-918aH4OlMi';

/**
 * En primer-pass de migración NO emitimos `convertido_a_proyecto` porque el
 * CHECK constraint exige `proyecto_id IS NOT NULL` y los proyectos todavía no
 * existen. El orquestador corre un post-pass que, tras cargar proyectos,
 * matchea por nombre y sube el estado a `convertido_a_proyecto`.
 */
function mapEstadoInicial(raw: string | null): string {
  if (!raw) return 'en_analisis';
  const s = raw.toLowerCase().trim();
  if (s.includes('análisis') || s.includes('analisis')) return 'en_analisis';
  if (s.includes('due diligence')) return 'en_due_diligence';
  if (s.includes('pausad')) return 'pausado';
  if (s.includes('no viable')) return 'no_viable';
  // "Convertido a Proyecto" y "En Trámite" → 'en_tramite' (post-pass upgradea)
  if (s.includes('trámite') || s.includes('tramite')) return 'en_tramite';
  if (s.includes('convertid') || s.includes('proyecto')) return 'en_tramite';
  return 'en_analisis';
}

function mapPrioridad(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('alta')) return 'alta';
  if (s.includes('media')) return 'media';
  if (s.includes('baja')) return 'baja';
  return null;
}

export async function migrateAnteproyectos(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.anteproyectos');

  console.log(`\n🚀 Anteproyectos — Coda ${CODA_TABLE_ID} → dilesa.anteproyectos`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  // Lookups por nombre
  const { data: terrenoRows } = await supabase
    .schema('dilesa' as any)
    .from('terrenos')
    .select('id, nombre')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const terrenoByName = new Map<string, string>();
  for (const t of terrenoRows ?? []) terrenoByName.set(t.nombre.toLowerCase().trim(), t.id);

  const { data: tipoProyRows } = await supabase
    .schema('dilesa' as any)
    .from('tipo_proyecto')
    .select('id, nombre')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const tipoProyByName = new Map<string, string>();
  for (const t of tipoProyRows ?? []) tipoProyByName.set(t.nombre.toLowerCase().trim(), t.id);

  const empleados = await loadEmpleadosLookup(supabase, env.empresaId);
  console.log(`  terrenos=${terrenoByName.size}  tipo_proyecto=${tipoProyByName.size}  empleados=${empleados.entries.length}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID);
  report.fetched = rows.length;
  console.log(`  fetched: ${rows.length} rows\n`);

  for (const row of rows) {
    const v = row.values;

    const nombre = str(pick(v, colMap, 'id anteproyecto', 'nombre')) ?? row.name;
    if (!nombre) {
      report.warnings.push(`row ${row.id}: empty nombre`);
      report.skipped++;
      continue;
    }

    const terrenoName = str(pick(v, colMap, 'terreno'));
    const terreno_id = terrenoName ? terrenoByName.get(terrenoName.toLowerCase().trim()) ?? null : null;
    if (!terreno_id) {
      report.warnings.push(`anteproyecto "${nombre}": terreno "${terrenoName ?? '(vacío)'}" no encontrado en BSOP`);
      report.skipped++;
      continue;
    }

    const tipoName = str(pick(v, colMap, 'tipo de proyecto', 'tipo'));
    const tipo_proyecto_id = tipoName ? tipoProyByName.get(tipoName.toLowerCase().trim()) ?? null : null;
    if (tipoName && !tipo_proyecto_id) {
      report.warnings.push(`anteproyecto "${nombre}": tipo_proyecto "${tipoName}" no encontrado`);
    }

    const plano_lotificacion_url = firstUrl(
      pick(v, colMap, 'plano proyecto lotificación', 'plano proyecto lotificacion', 'plano lotificación')
    );
    const area_vendible_m2 = num(pick(v, colMap, 'area vendible', 'área vendible'));
    const areas_verdes_m2 = num(pick(v, colMap, 'areas verdes', 'áreas verdes'));
    const cantidad_lotes = int(pick(v, colMap, 'cantidad de lotes', 'cantidad lotes'));
    const infraestructura_cabecera_inversion = num(
      pick(v, colMap, 'infraestructura de cabecera necesaria', 'infraestructura cabecera')
    );

    const estado = mapEstadoInicial(str(pick(v, colMap, 'estado del anteproyecto', 'estado')));
    const prioridad = mapPrioridad(str(pick(v, colMap, 'prioridad')));
    const decision_actual = str(pick(v, colMap, 'decisión actual', 'decision actual'));
    const responsable_raw = str(pick(v, colMap, 'responsable'));
    const responsable_id = resolveEmpleado(empleados, responsable_raw);
    if (responsable_raw && !responsable_id) {
      report.warnings.push(`anteproyecto "${nombre}": no match responsable "${responsable_raw}"`);
    }
    const fecha_ultima_revision = dateStr(pick(v, colMap, 'fecha última revisión', 'fecha ultima revision'));
    const siguiente_accion = str(pick(v, colMap, 'siguiente acción', 'siguiente accion'));
    const motivo_no_viable = str(pick(v, colMap, 'motivo no viable', 'razón no viable'));
    const notas = str(pick(v, colMap, 'notas'));
    const fecha_inicio = dateStr(pick(v, colMap, 'fecha inicio anteproyecto', 'fecha inicio'));

    const payload = {
      empresa_id: env.empresaId,
      nombre,
      clave_interna: nombre, // evita colisión NULLS NOT DISTINCT en clave_interna_empresa_uk
      terreno_id,
      tipo_proyecto_id,
      fecha_inicio,
      plano_lotificacion_url,
      area_vendible_m2,
      areas_verdes_m2,
      cantidad_lotes,
      infraestructura_cabecera_inversion,
      estado,
      prioridad,
      decision_actual,
      responsable_id,
      fecha_ultima_revision,
      siguiente_accion,
      motivo_no_viable,
      notas,
      coda_row_id: row.id,
    };

    if (env.dryRun) {
      console.log(`  [DRY] ${nombre} | terreno=${terrenoName} | estado=${estado} | lotes=${cantidad_lotes ?? '-'}`);
      report.created++;
      continue;
    }

    const { data: existing } = await supabase
      .schema('dilesa' as any)
      .from('anteproyectos')
      .select('id')
      .eq('empresa_id', env.empresaId)
      .eq('coda_row_id', row.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('anteproyectos')
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
        .from('anteproyectos')
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
  migrateAnteproyectos().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
