/**
 * migrate_dilesa_fraccionamiento_prototipo.ts
 *
 * Carga la M:N proyecto ↔ prototipo desde Coda. Requiere proyectos y
 * prototipos ya cargados.
 *
 *   grid-iGIRvYfGUx  Fraccionamiento-Prototipo → dilesa.fraccionamiento_prototipo
 *
 * Shape real (2026-04-23) — esta tabla junction tiene TODO el costo/precio:
 *   - ID Prototipo (display)  = código compuesto "LV-ISC" (proyecto-prefijo + prototipo)
 *   - Proyecto (lookup)       → display name del proyecto
 *   - Valor Comercial         → precio_venta (override)
 *   - Costo Urbanización/Materiales/MO/RUV/Seguro/Comercialización → se usan para
 *     popular el master prototipo si aún está vacío (first-write wins)
 *
 * El prototipo master al que enlaza se deduce del sufijo tras el último "-"
 * ("LV-ISC" → "ISC"), o por lookup de "Prototipo" si existe como columna.
 *
 * UNIQUE (proyecto_id, prototipo_id). Duplicados in-batch → last-write wins.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_fraccionamiento_prototipo.ts
 *   npx tsx scripts/migrate_dilesa_fraccionamiento_prototipo.ts
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

const CODA_TABLE_ID = 'grid-iGIRvYfGUx';

/** Extrae el código de prototipo desde "LV-ISC" → "ISC" (último segmento tras "-"). */
function extractPrototipoCodigo(idPrototipo: string): string {
  const parts = idPrototipo.split('-');
  return parts[parts.length - 1].trim();
}

export async function migrateFraccionamientoPrototipo(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.fraccionamiento_prototipo');

  console.log(`\n🚀 Fraccionamiento-Prototipo — Coda ${CODA_TABLE_ID} → dilesa.fraccionamiento_prototipo`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  // Index proyectos + prototipos por nombre (Coda devuelve display names)
  const { data: proyRows } = await supabase
    .schema('dilesa' as any)
    .from('proyectos')
    .select('id, nombre, codigo')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const proyByName = new Map<string, string>();
  for (const p of proyRows ?? []) {
    proyByName.set(p.nombre.toLowerCase().trim(), p.id);
    if (p.codigo) proyByName.set(p.codigo.toLowerCase().trim(), p.id);
  }

  const { data: protoRows } = await supabase
    .schema('dilesa' as any)
    .from('prototipos')
    .select('id, nombre, costo_urbanizacion')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const protoByName = new Map<string, { id: string; hasCosts: boolean }>();
  for (const p of protoRows ?? []) {
    protoByName.set(p.nombre.toLowerCase().trim(), {
      id: p.id,
      hasCosts: p.costo_urbanizacion !== null,
    });
  }
  console.log(`  proyectos=${proyByName.size}  prototipos=${protoByName.size}`);

  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID);
  report.fetched = rows.length;
  console.log(`  fetched: ${rows.length} rows\n`);

  const seenPairs = new Set<string>();

  for (const row of rows) {
    const v = row.values;

    const idPrototipo = str(pick(v, colMap, 'id prototipo', 'prototipo')) ?? row.name;
    if (!idPrototipo) {
      report.warnings.push(`row ${row.id}: empty ID Prototipo`);
      report.skipped++;
      continue;
    }

    const proyNombre = str(pick(v, colMap, 'proyecto'));
    if (!proyNombre) {
      report.warnings.push(`row ${row.id} (${idPrototipo}): proyecto vacío`);
      report.skipped++;
      continue;
    }

    const proyecto_id = proyByName.get(proyNombre.toLowerCase().trim()) ?? null;
    if (!proyecto_id) {
      report.warnings.push(`row ${idPrototipo}: proyecto "${proyNombre}" no encontrado en BSOP`);
      report.skipped++;
      continue;
    }

    const protoCodigo = extractPrototipoCodigo(idPrototipo);
    const proto = protoByName.get(protoCodigo.toLowerCase().trim()) ?? null;
    if (!proto) {
      report.warnings.push(`row ${idPrototipo}: prototipo "${protoCodigo}" (de ${idPrototipo}) no encontrado en BSOP`);
      report.skipped++;
      continue;
    }
    const prototipo_id = proto.id;

    const pairKey = `${proyecto_id}:${prototipo_id}`;
    if (seenPairs.has(pairKey)) {
      report.warnings.push(`duplicate pair (proy=${proyecto_id.slice(0, 8)}, proto=${prototipo_id.slice(0, 8)}) → last-write wins`);
    }
    seenPairs.add(pairKey);

    // Junction data
    const valor_comercial = num(pick(v, colMap, 'valor comercial'));
    const cantidad_unidades =
      int(pick(v, colMap, 'cantidad', 'cantidad unidades', 'unidades', 'inventario disponible')) ?? 0;
    const notas = str(pick(v, colMap, 'notas', 'observaciones'));

    // Costos per-proyecto — se reflejan en junction como precio_venta override,
    // y si el prototipo master aún no tiene costos cargados, backfill opportunistic.
    const costo_urbanizacion = num(pick(v, colMap, 'costo urbanización', 'costo urbanizacion'));
    const costo_materiales = num(pick(v, colMap, 'costo materiales'));
    const costo_mano_obra = num(pick(v, colMap, 'costo mo', 'costo mano de obra'));
    const costo_registro_ruv = num(pick(v, colMap, 'registro ruv'));
    const seguro_calidad = num(pick(v, colMap, 'seguro de calidad'));
    const costo_comercializacion = num(pick(v, colMap, 'costo de comercialización', 'costo de comercializacion'));

    const junctionPayload = {
      empresa_id: env.empresaId,
      proyecto_id,
      prototipo_id,
      cantidad_unidades,
      precio_venta: valor_comercial,
      notas,
      coda_row_id: row.id,
    };

    if (env.dryRun) {
      console.log(`  [DRY] proy=${proyNombre} proto=${protoCodigo} qty=${cantidad_unidades} precio=${valor_comercial ?? '-'}`);
      report.created++;
      continue;
    }

    // Backfill master prototipo si está vacío (primera vez que vemos costos)
    if (!proto.hasCosts && (costo_urbanizacion || costo_materiales || costo_mano_obra)) {
      const { error: upErr } = await supabase
        .schema('dilesa' as any)
        .from('prototipos')
        .update({
          costo_urbanizacion,
          costo_materiales,
          costo_mano_obra,
          costo_registro_ruv,
          seguro_calidad,
          costo_comercializacion,
          valor_comercial,
        })
        .eq('id', prototipo_id)
        .is('costo_urbanizacion', null); // solo si sigue null
      if (!upErr) {
        proto.hasCosts = true; // evita re-update en el mismo batch
      }
    }

    const { data: existing } = await supabase
      .schema('dilesa' as any)
      .from('fraccionamiento_prototipo')
      .select('id')
      .eq('proyecto_id', proyecto_id)
      .eq('prototipo_id', prototipo_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('fraccionamiento_prototipo')
        .update(junctionPayload)
        .eq('id', existing.id);
      if (error) {
        report.errors.push(`pair ${proyNombre}/${protoCodigo}: ${error.message}`);
        if (!env.continueOnError) throw new Error(error.message);
      } else {
        report.updated++;
      }
    } else {
      const { error } = await supabase
        .schema('dilesa' as any)
        .from('fraccionamiento_prototipo')
        .insert(junctionPayload);
      if (error) {
        report.errors.push(`pair ${proyNombre}/${protoCodigo}: ${error.message}`);
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
  migrateFraccionamientoPrototipo().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
