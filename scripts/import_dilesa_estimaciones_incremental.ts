/**
 * import_dilesa_estimaciones_incremental.ts
 *
 * Iniciativa dilesa-estimaciones · Sprint 6 (sync + cutover).
 *
 * Las estimaciones NO viven como tabla propia en Coda — son derivadas
 * agrupando `Tareas Construcción Terminada` por (contratista, fecha_pagada).
 *
 * Cada noche tras el sync de tareas terminadas pueden aparecer fechas_pagada
 * nuevas (cierres recientes en Coda). Este script llama el RPC
 * `dilesa.fn_estimaciones_backfill_incremental()` que crea idempotentemente
 * las estimaciones para grupos nuevos + vincula tareas sueltas.
 *
 * La lógica vive en la función SQL (migración
 * 20260526004300_dilesa_estimaciones_backfill_incremental_fn.sql) —
 * este script solo invoca y reporta conteos.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main(): Promise<void> {
  console.log('▶ Estimaciones — backfill incremental');

  const { data, error } = await sb.schema('dilesa').rpc('fn_estimaciones_backfill_incremental');

  if (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  }

  // RPC RETURNS TABLE devuelve array de una sola row.
  const row = (
    data as Array<{ estimaciones_creadas: number; tareas_vinculadas: number }> | null
  )?.[0];
  const creadas = row?.estimaciones_creadas ?? 0;
  const vinculadas = row?.tareas_vinculadas ?? 0;

  console.log(`  ✔ Estimaciones nuevas: ${creadas} · tareas vinculadas: ${vinculadas}`);
}

void main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
