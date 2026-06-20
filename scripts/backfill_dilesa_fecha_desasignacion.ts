/**
 * backfill_dilesa_fecha_desasignacion.ts
 *
 * Puebla `dilesa.ventas.fecha_desasignacion` con la fecha REAL de cuándo se
 * desasignó cada venta. Dos fuentes, en orden de prioridad:
 *
 *   1. Coda `F📅Desasigna🚫` (histórico), por `coda_row_id` — fuente primaria.
 *   2. El timestamp ISO embebido en `notas` (`[2026-06-18T..Z] Desasignada…`),
 *      para las desasignadas nativas de BSOP (post-cutover, sin fila de Coda).
 *
 * Solo toca ventas con `estado='desasignada'`. Idempotente (re-correr re-pobla).
 *
 * Env: CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_fecha_desasignacion.ts
 *   npx tsx scripts/backfill_dilesa_fecha_desasignacion.ts
 */
import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, dateStr } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';
const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Fecha (YYYY-MM-DD) del último timestamp ISO que precede a "Desasignada" en notas. */
function fechaDeNotas(notas: string | null): string | null {
  if (!notas) return null;
  const matches = [...notas.matchAll(/\[(\d{4}-\d{2}-\d{2})T[^\]]*\]\s*Desasignada/gi)];
  return matches.length === 0 ? null : matches[matches.length - 1][1];
}

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const coda = new CodaClient(CODA_API_KEY);

  // 1. Fechas de Coda por coda_row_id.
  const cols = await coda.listColumns(CODA_DOC, CODA_CLIENTES);
  const cm = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC, CODA_CLIENTES);
  const codaFecha = new Map<string, string>();
  for (const row of rows) {
    const f = dateStr(pick(row.values, cm, 'F📅Desasigna🚫'));
    if (f) codaFecha.set(row.id, f);
  }
  console.log(`Coda: ${codaFecha.size} filas con fecha de desasignación.`);

  // 2. Ventas desasignadas de BSOP.
  const { data: ventas, error } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, coda_row_id, notas')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('deleted_at', null)
    .eq('estado', 'desasignada');
  if (error) throw error;

  let deCoda = 0;
  let deNotas = 0;
  let sinFecha = 0;
  const updates: Array<{ id: string; fecha: string }> = [];
  for (const v of ventas ?? []) {
    let fecha = v.coda_row_id ? (codaFecha.get(v.coda_row_id as string) ?? null) : null;
    if (fecha) deCoda += 1;
    else {
      fecha = fechaDeNotas(v.notas as string | null);
      if (fecha) deNotas += 1;
    }
    if (fecha) updates.push({ id: v.id as string, fecha });
    else sinFecha += 1;
  }
  console.log(
    `Desasignadas: ${ventas?.length ?? 0}. Con fecha de Coda: ${deCoda}, de notas: ${deNotas}, sin fecha: ${sinFecha}.`
  );

  if (DRY_RUN) {
    console.log('DRY_RUN — muestra de 8:');
    for (const u of updates.slice(0, 8)) console.log(`  ${u.id} → ${u.fecha}`);
    return;
  }

  let ok = 0;
  for (const u of updates) {
    const { error: upErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({ fecha_desasignacion: u.fecha })
      .eq('id', u.id);
    if (upErr) console.error(`  Error ${u.id}: ${upErr.message}`);
    else ok += 1;
  }
  console.log(`✓ Pobladas ${ok}/${updates.length} fechas de desasignación.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
