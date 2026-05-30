/**
 * backfill_dilesa_costo_materiales.ts
 *
 * Jala "Costo Materiales" del grid Construcción por Lote en Coda
 * (grid-CkajhVirlg) y actualiza dilesa.construccion.costo_materiales
 * via coda_row_id.
 *
 * Solo actualiza filas con coda_row_id y costo_materiales IS NULL
 * (no pisa valores ya capturados en BSOP).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_costo_materiales.ts
 *   npx tsx scripts/backfill_dilesa_costo_materiales.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, num } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? process.env.CODA_API_TOKEN ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_CONSTRUCCION = 'grid-CkajhVirlg';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY o CODA_API_TOKEN');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── 1. Listar columnas para encontrar "Costo Materiales" ──────────────
  const cols = await coda.listColumns(CODA_DOC, T_CONSTRUCCION);
  const cm = buildColumnMap(cols);

  const matColNames = cols
    .filter((c) => c.name.toLowerCase().includes('material'))
    .map((c) => c.name);
  console.log(
    `Columnas con "material": ${matColNames.length ? matColNames.join(', ') : '(ninguna)'}`
  );

  // ── 2. Cargar todas las filas de Coda ─────────────────────────────────
  console.log('Cargando filas de Coda (puede tardar ~30s)...');
  const rows = await coda.listRowsAll(CODA_DOC, T_CONSTRUCCION);
  console.log(`Coda: ${rows.length} filas.`);

  // ── 3. Extraer coda_row_id → costo_materiales ────────────────────────
  const updates: { codaRowId: string; costoMateriales: number }[] = [];
  for (const row of rows) {
    const val = num(pick(row.values, cm, 'Costo Materiales', 'Costo de Materiales', 'Materiales'));
    if (val != null && val > 0) {
      updates.push({ codaRowId: row.id, costoMateriales: val });
    }
  }
  console.log(`${updates.length} filas con Costo Materiales > 0.`);

  if (DRY_RUN) {
    console.log('DRY_RUN — primeros 5 valores:');
    for (const u of updates.slice(0, 5)) {
      console.log(`  ${u.codaRowId} → $${u.costoMateriales.toLocaleString()}`);
    }
    return;
  }

  // ── 4. Cargar coda_row_ids existentes en BSOP ────────────────────────
  const { data: existentes, error: exErr } = await sb
    .schema('dilesa')
    .from('construccion')
    .select('id, coda_row_id')
    .not('coda_row_id', 'is', null)
    .is('costo_materiales', null);
  if (exErr) throw new Error(`Error leyendo construccion: ${exErr.message}`);

  const idPorCodaRow = new Map(
    (existentes ?? []).map((r) => [r.coda_row_id as string, r.id as string])
  );
  console.log(
    `${idPorCodaRow.size} construcciones en BSOP con coda_row_id y sin costo_materiales.`
  );

  // ── 5. Actualizar en batches ──────────────────────────────────────────
  let updated = 0;
  let skipped = 0;
  const BATCH = 50;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) {
      const bsopId = idPorCodaRow.get(u.codaRowId);
      if (!bsopId) {
        skipped++;
        continue;
      }
      const { error } = await sb
        .schema('dilesa')
        .from('construccion')
        .update({ costo_materiales: u.costoMateriales })
        .eq('id', bsopId);
      if (error) {
        console.warn(`  ⚠ ${u.codaRowId}: ${error.message}`);
      } else {
        updated++;
      }
    }
    if (i % 200 === 0 && i > 0) {
      console.log(`  ... ${updated} actualizadas, ${skipped} sin match`);
    }
  }

  console.log(`\nResultado: ${updated} actualizadas, ${skipped} sin match en BSOP.`);

  // ── 6. Recalcular promedios en productos ──────────────────────────────
  console.log('\nRecalculando costo_materiales_referencia en productos...');
  const { error: refErr } = await sb.rpc(
    'exec_sql' as never,
    {
      query: `
      UPDATE dilesa.productos p
      SET costo_materiales_referencia = sub.avg_mat
      FROM (
        SELECT c.producto_id,
               round(avg(c.costo_materiales), 2) AS avg_mat
        FROM dilesa.construccion c
        WHERE c.deleted_at IS NULL
          AND c.estado IN ('terminada','dtu','seguro_calidad','extraida')
          AND c.costo_materiales IS NOT NULL
          AND c.costo_materiales > 0
        GROUP BY c.producto_id
      ) sub
      WHERE p.id = sub.producto_id
        AND p.deleted_at IS NULL
    `,
    } as never
  );

  if (refErr) {
    console.warn(
      `  ⚠ Error recalculando promedios (se puede hacer manualmente): ${refErr.message}`
    );
    console.log(
      "  SQL manual:\n    UPDATE dilesa.productos p SET costo_materiales_referencia = sub.avg_mat FROM (SELECT c.producto_id, round(avg(c.costo_materiales),2) AS avg_mat FROM dilesa.construccion c WHERE c.deleted_at IS NULL AND c.estado IN ('terminada','dtu','seguro_calidad','extraida') AND c.costo_materiales IS NOT NULL AND c.costo_materiales > 0 GROUP BY c.producto_id) sub WHERE p.id = sub.producto_id AND p.deleted_at IS NULL;"
    );
  } else {
    console.log('  ✓ Promedios actualizados.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
