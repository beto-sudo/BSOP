/**
 * migrate_dilesa_terrenos.ts
 *
 * Carga dilesa.terrenos desde Coda.
 *
 *   grid-0MSgwKOC9A  Terrenos → dilesa.terrenos
 *
 * Mapeo: basado en /mnt/DILESA/knowledge/modules/terrenos-columnas-definitivas.md
 * (38 columnas A–H). Las columnas calculadas (F.) son GENERATED en el schema,
 * no se migran. La columna Anteproyectos (G.) es derivada, tampoco se migra.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_terrenos.ts
 *   npx tsx scripts/migrate_dilesa_terrenos.ts
 */

import {
  CodaClient,
  buildColumnMap,
  dateStr,
  firstUrl,
  num,
  pick,
  str,
} from '../lib/coda-api';
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

const CODA_TABLE_ID = 'grid-0MSgwKOC9A';

function mapPrioridad(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('alta')) return 'alta';
  if (s.includes('media')) return 'media';
  if (s.includes('baja')) return 'baja';
  return null;
}

export async function migrateTerrenos(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.terrenos');

  console.log(`\n🚀 Terrenos — Coda ${CODA_TABLE_ID} → dilesa.terrenos`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  const empleados = await loadEmpleadosLookup(supabase, env.empresaId);
  console.log(`  empleados cargados: ${empleados.entries.length}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID);
  report.fetched = rows.length;
  console.log(`  fetched: ${rows.length} rows\n`);

  for (const row of rows) {
    const v = row.values;

    // A. Identidad
    const nombre =
      str(pick(v, colMap, 'nombre del terreno', 'nombre', 'name', 'id terreno')) ?? row.name;
    if (!nombre) {
      report.warnings.push(`row ${row.id}: empty nombre`);
      report.skipped++;
      continue;
    }
    const clave_interna = str(pick(v, colMap, 'clave interna terreno', 'clave interna', 'clave'));
    const tipo = str(pick(v, colMap, 'tipo de terreno', 'tipo'));
    const area_terreno_m2 = num(pick(v, colMap, 'area del terreno m²', 'area del terreno m2', 'area terreno'));
    const areas_afectacion_m2 = num(
      pick(v, colMap, 'areas de afectación m²', 'areas de afectacion m2', 'areas afectacion')
    );
    const objetivo = str(pick(v, colMap, 'objetivo del terreno', 'objetivo'));
    const numero_escritura = str(pick(v, colMap, 'numero de escritura', 'número de escritura'));
    const fecha_captura_raw = str(pick(v, colMap, 'fecha captura', 'fecha de captura'));
    // fecha_captura tiene DEFAULT now() — solo overridear si Coda trae un valor parseable
    const fecha_captura = fecha_captura_raw ? new Date(fecha_captura_raw) : null;
    const fecha_captura_iso =
      fecha_captura && !isNaN(fecha_captura.getTime()) ? fecha_captura.toISOString() : undefined;

    // B. Ubicación
    const municipio = str(pick(v, colMap, 'municipio'));
    const zona_sector = str(pick(v, colMap, 'zona / sector', 'zona/sector', 'zona sector', 'zona'));
    const direccion_referencia = str(
      pick(v, colMap, 'dirección / referencia', 'direccion / referencia', 'dirección', 'direccion', 'referencia')
    );

    // C. Contacto
    const nombre_propietario = str(pick(v, colMap, 'nombre propietario', 'propietario'));
    const telefono_propietario = str(pick(v, colMap, 'telefono propietario', 'teléfono propietario'));
    const nombre_corredor = str(pick(v, colMap, 'nombre corredor', 'corredor'));
    const telefono_corredor = str(pick(v, colMap, 'telefono corredor', 'teléfono corredor'));

    // D. Económica
    const precio_solicitado_m2 = num(
      pick(v, colMap, 'precio solicitado x m²', 'precio solicitado x m2', 'precio solicitado')
    );
    const precio_ofertado_m2 = num(
      pick(v, colMap, 'precio x m² ofertado', 'precio x m2 ofertado', 'precio ofertado')
    );
    const valor_interno_estimado = num(pick(v, colMap, 'valor interno estimado'));
    const valor_objetivo_compra = num(pick(v, colMap, 'valor objetivo de compra', 'valor objetivo'));

    // E. Gestión
    const origen = str(pick(v, colMap, 'origen del terreno', 'origen'));
    const estatus_propiedad = str(pick(v, colMap, 'estatus de propiedad', 'estatus propiedad', 'estatus'));
    const etapa = str(pick(v, colMap, 'etapa del terreno', 'etapa'));
    const decision_actual = str(pick(v, colMap, 'decisión actual', 'decision actual'));
    const prioridad = mapPrioridad(str(pick(v, colMap, 'prioridad')));
    const responsable_raw = str(pick(v, colMap, 'responsable'));
    const responsable_id = resolveEmpleado(empleados, responsable_raw);
    if (responsable_raw && !responsable_id) {
      report.warnings.push(`terreno "${nombre}": no match para responsable "${responsable_raw}"`);
    }
    const fecha_ultima_revision = dateStr(pick(v, colMap, 'fecha última revisión', 'fecha ultima revision'));
    const siguiente_accion = str(pick(v, colMap, 'siguiente acción', 'siguiente accion'));

    // H. Documentos
    const imagen_zcu_url = firstUrl(pick(v, colMap, 'imagen zcu', 'imagen zona de clasificación urbana'));
    const archivo_kmz_url = firstUrl(pick(v, colMap, 'archivo kmz', 'kmz', 'plano kmz'));
    const pdf_escritura_url = firstUrl(pick(v, colMap, 'pdf escritura', 'escritura pdf'));
    const notas = str(pick(v, colMap, 'notas'));

    const payload: Record<string, unknown> = {
      empresa_id: env.empresaId,
      nombre,
      clave_interna,
      tipo,
      area_terreno_m2,
      areas_afectacion_m2,
      objetivo,
      numero_escritura,
      municipio,
      zona_sector,
      direccion_referencia,
      nombre_propietario,
      telefono_propietario,
      nombre_corredor,
      telefono_corredor,
      precio_solicitado_m2,
      precio_ofertado_m2,
      valor_interno_estimado,
      valor_objetivo_compra,
      origen,
      estatus_propiedad,
      etapa,
      decision_actual,
      prioridad,
      responsable_id,
      fecha_ultima_revision,
      siguiente_accion,
      imagen_zcu_url,
      archivo_kmz_url,
      pdf_escritura_url,
      notas,
      coda_row_id: row.id,
    };
    if (fecha_captura_iso) payload.fecha_captura = fecha_captura_iso;

    if (env.dryRun) {
      console.log(`  [DRY] ${nombre} | ${municipio ?? '-'} | ${estatus_propiedad ?? '-'} | resp=${responsable_raw ?? '-'}→${responsable_id ?? '·'}`);
      report.created++;
      continue;
    }

    const { data: existing } = await supabase
      .schema('dilesa' as any)
      .from('terrenos')
      .select('id')
      .eq('empresa_id', env.empresaId)
      .eq('coda_row_id', row.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('terrenos')
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
        .from('terrenos')
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
  migrateTerrenos().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
