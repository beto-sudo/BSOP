/**
 * backfill_dilesa_cheque_notaria.ts
 *
 * Backfill puntual de los 2 campos de cheque a la notaría (Fase 11) desde
 * Coda → dilesa.ventas, SIN tocar el resto de campos (a diferencia del import
 * completo, que hace DELETE+INSERT). Match por `coda_row_id`.
 *
 *   - numero_cheque_notaria ← "Numero Cheque Notaria"
 *   - monto_cheque_notaria  ← "Monto Cheque Notaria"
 *
 * DRY por default: imprime las columnas Coda que matchean cheque/notaria,
 * cuenta filas con dato y muestra muestras, SIN escribir. Para aplicar:
 *   DRY_RUN=0 npx tsx --env-file=.env.local scripts/backfill_dilesa_cheque_notaria.ts
 *
 * Env: CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN !== '0'; // default: dry

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const cCols = await coda.listColumns(CODA_DOC, CODA_CLIENTES);
  const cm = buildColumnMap(cCols);

  // Verificación: nombres reales de columna que mencionan cheque/notaría.
  const matching = cCols.filter((c) => /cheque|notar/i.test(c.name)).map((c) => c.name);
  console.log('Columnas Coda con "cheque"/"notaria":', matching);

  const cRows = await coda.listRowsAll(CODA_DOC, CODA_CLIENTES);
  console.log(`Coda: ${cRows.length} filas en Clientes.`);

  let conDato = 0;
  let actualizadas = 0;
  let sinMatch = 0;
  const samples: Array<{ id: string; num: string | null; monto: number | null }> = [];

  for (const row of cRows) {
    const v = row.values;
    const numeroCheque = str(pick(v, cm, 'Numero de Cheque Notaria'));
    const montoCheque = num(pick(v, cm, 'Monto Cheque Notaria'));
    if (numeroCheque == null && montoCheque == null) continue;
    conDato += 1;
    if (samples.length < 5) samples.push({ id: row.id, num: numeroCheque, monto: montoCheque });

    if (DRY_RUN) continue;

    const { data, error } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({ numero_cheque_notaria: numeroCheque, monto_cheque_notaria: montoCheque })
      .eq('coda_row_id', row.id)
      .is('deleted_at', null)
      .select('id');
    if (error) {
      console.error(`  ✗ coda_row_id=${row.id}: ${error.message}`);
      continue;
    }
    if (!data || data.length === 0) sinMatch += 1;
    else actualizadas += data.length;
  }

  console.log(`\nFilas Coda con dato de cheque: ${conDato}`);
  console.log('Muestras:', samples);
  if (DRY_RUN) {
    console.log('\n[DRY] No se escribió nada. Corre con DRY_RUN=0 para aplicar.');
  } else {
    console.log(`\nVentas actualizadas en BSOP: ${actualizadas}`);
    console.log(
      `Filas Coda con dato pero sin venta en BSOP (coda_row_id no encontrado): ${sinMatch}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
