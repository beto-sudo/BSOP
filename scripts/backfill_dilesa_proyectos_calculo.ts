/**
 * backfill_dilesa_proyectos_calculo.ts
 *
 * Sprint 7a — backfill desde Coda de los 3 campos nuevos en dilesa.proyectos
 * (precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria) +
 * el snapshot de valor_venta_futuro por unidad.
 *
 * Estos campos son entrada del cálculo de precio de venta en Fase 1
 * (Solicitud de Asignación). Se mantienen al día con el cron diario de
 * import_dilesa_proyectos.ts e import_dilesa_inventario.ts después de
 * que esos scripts se extiendan (Sprint 7b o posterior).
 *
 * Por ahora, este es un one-off para poblar los datos existentes.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_proyectos_calculo.ts
 *   npx tsx scripts/backfill_dilesa_proyectos_calculo.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, num, str } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Mapea texto Coda → enum SQL clasificacion_inmobiliaria. */
function mapClasificacion(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes('interes social') || s.includes('interés social')) return 'interes_social';
  if (s.includes('residencial medio')) return 'residencial_medio';
  if (s.includes('residencial alto')) return 'residencial_alto';
  if (s.includes('plaza')) return 'plaza_comercial';
  if (s.includes('industrial')) return 'industrial';
  if (s.includes('mixto')) return 'mixto';
  console.warn(`⚠ Clasificación desconocida: "${raw}" — guardando null`);
  return null;
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  // ── Proyectos: 3 campos nuevos ──────────────────────────────────────────────
  const pCols = await coda.listColumns(CODA_DOC, 'Proyectos');
  const pCm = buildColumnMap(pCols);
  const pRows = await coda.listRowsAll(CODA_DOC, 'Proyectos');
  console.log(`Coda Proyectos: ${pRows.length}`);

  let okPrj = 0;
  let nullData = 0;
  for (const row of pRows) {
    const nombre = str(pick(row.values, pCm, 'ID Proyecto'));
    if (!nombre) continue;

    const clasif = mapClasificacion(str(pick(row.values, pCm, 'Clasificación Inmobiliaria')));
    const lotePromedio = num(pick(row.values, pCm, 'Tamaño Lote Promedio'));
    const precioM2 = num(pick(row.values, pCm, 'Precio M² Excedente'));

    if (clasif === null && lotePromedio === null && precioM2 === null) {
      console.warn(`⚠ ${nombre}: sin datos del cálculo en Coda — skip`);
      nullData++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  · ${nombre}: clasif=${clasif} lote_prom=${lotePromedio} precio_m2_excd=${precioM2}`
      );
      okPrj++;
      continue;
    }

    const { error } = await sb
      .schema('dilesa')
      .from('proyectos')
      .update({
        clasificacion_inmobiliaria: clasif,
        tamano_lote_promedio: lotePromedio,
        precio_m2_excedente: precioM2,
      })
      .eq('empresa_id', empresaId)
      .eq('nombre', nombre);

    if (error) {
      console.error(`✗ ${nombre}: ${error.message}`);
      continue;
    }
    okPrj++;
  }
  console.log(`✔ Proyectos actualizados: ${okPrj}/${pRows.length} (${nullData} sin datos)`);

  // ── Unidades: valor_venta_futuro snapshot ───────────────────────────────────
  const iCols = await coda.listColumns(CODA_DOC, 'table-SdHaueIzGX');
  const iCm = buildColumnMap(iCols);
  const iRows = await coda.listRowsAll(CODA_DOC, 'table-SdHaueIzGX');
  console.log(`\nCoda Inventario: ${iRows.length}`);

  let okU = 0;
  let conValor = 0;
  for (const row of iRows) {
    const identificador = str(pick(row.values, iCm, 'ID Inventario'));
    if (!identificador) continue;
    const valorFuturo = num(pick(row.values, iCm, 'Valor Venta Futuro')) ?? 0;
    if (valorFuturo > 0) conValor++;

    if (DRY_RUN) {
      okU++;
      continue;
    }

    const { error } = await sb
      .schema('dilesa')
      .from('unidades')
      .update({ valor_venta_futuro_snapshot: valorFuturo })
      .eq('empresa_id', empresaId)
      .eq('identificador', identificador);

    if (error) {
      console.error(`✗ unidad ${identificador}: ${error.message}`);
      continue;
    }
    okU++;
  }
  console.log(`✔ Unidades actualizadas: ${okU}/${iRows.length} (${conValor} con valor > 0)`);

  // ── Productos: valor_comercial_referencia (estaba vacío en el import) ───────
  const prCols = await coda.listColumns(CODA_DOC, 'Prototipos');
  const prCm = buildColumnMap(prCols);
  const prRows = await coda.listRowsAll(CODA_DOC, 'Prototipos');
  console.log(`\nCoda Prototipos: ${prRows.length}`);

  let okPr = 0;
  for (const row of prRows) {
    const nombre = str(pick(row.values, prCm, 'ID Prototipo'));
    if (!nombre) continue;
    const valor = num(pick(row.values, prCm, 'Valor Comercial'));
    if (!valor) continue;

    if (DRY_RUN) {
      console.log(`  · ${nombre}: $${valor}`);
      okPr++;
      continue;
    }

    const { error } = await sb
      .schema('dilesa')
      .from('productos')
      .update({ valor_comercial_referencia: valor })
      .eq('empresa_id', empresaId)
      .eq('nombre', nombre);

    if (error) {
      console.error(`✗ producto ${nombre}: ${error.message}`);
      continue;
    }
    okPr++;
  }
  console.log(`✔ Productos actualizados: ${okPr}/${prRows.length}`);

  if (DRY_RUN) console.log('\n=== DRY RUN — no se escribió nada ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
