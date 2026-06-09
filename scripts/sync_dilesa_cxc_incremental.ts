/**
 * sync_dilesa_cxc_incremental.ts
 *
 * Iniciativa dilesa-ventas-expediente · Sprint 2c — puente nocturno
 * venta_pagos → CxC (vigente hasta el cutoff de ventas).
 *
 * El sync diario importa los depósitos de Coda a `dilesa.venta_pagos`, pero la
 * UI (cuadratura + estado de cuenta del Expediente de Operación) lee
 * `erp.cxc_pagos`. El puente original fue one-shot (fn_backfill_cxc +
 * recableo de adjuntos, migración 20260602180000) y quedó congelado — los
 * depósitos nuevos no llegaban a CxC. Este paso lo vuelve incremental:
 *
 *   1. RPC `dilesa.fn_backfill_cxc()` — idempotente (skip por coda_row_id):
 *      genera planes de cargos nuevos, espeja pagos nuevos, aplica FIFO.
 *   2. Recablea adjuntos de depósito venta_pago → cxc_pago (mismo DML que la
 *      migración 20260602180000) con guard anti-duplicado por
 *      coda_source_url — defensa por si vuelven a existir copias dobles.
 *   3. Setea `cxc_pagos.comprobante_adjunto_id` donde falte.
 *
 * Los pagos de ventas desasignadas o sin valor_escrituracion quedan fuera por
 * diseño (fn_backfill_cxc los salta); se auto-puentean si la venta avanza.
 *
 * Post-cutoff de ventas el daily se apaga y este paso muere con él.
 *
 * Prerequisites (env): SUPABASE_DB_URL.
 * Uso: npx tsx scripts/sync_dilesa_cxc_incremental.ts
 */
import { Client } from 'pg';

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? '';
if (!SUPABASE_DB_URL) throw new Error('Falta SUPABASE_DB_URL');

const RECABLE_SQL = `
with map as (
  select a.id          as adjunto_id,
         a.entidad_id  as venta_pago_id,
         cp.id         as cxc_pago_id
  from erp.adjuntos a
  join dilesa.venta_pagos vp on vp.id = a.entidad_id and vp.deleted_at is null
  join erp.cxc_pagos cp on cp.coda_row_id = vp.coda_row_id and cp.deleted_at is null
  where a.entidad_tipo = 'venta_pago'
    and not exists (
      select 1 from erp.adjuntos b
      where b.entidad_tipo = 'cxc_pago'
        and b.metadata->>'coda_source_url' = a.metadata->>'coda_source_url'
    )
)
update erp.adjuntos a
set entidad_tipo = 'cxc_pago',
    entidad_id   = m.cxc_pago_id,
    metadata     = coalesce(a.metadata, '{}'::jsonb)
                   || jsonb_build_object(
                        'recableado_de_venta_pago', m.venta_pago_id::text,
                        'recableado_en', now()::text,
                        'recableado_por', 'sync_dilesa_cxc_incremental'
                      )
from map m
where a.id = m.adjunto_id
`;

const COMPROBANTE_SQL = `
with pref as (
  select distinct on (a.entidad_id)
         a.entidad_id as cxc_pago_id,
         a.id         as adjunto_id
  from erp.adjuntos a
  where a.entidad_tipo = 'cxc_pago'
  order by a.entidad_id,
           case a.rol
             when 'comprobante_deposito' then 0
             when 'comprobante'          then 1
             when 'recibo_caja'          then 2
             else 3
           end,
           a.created_at
)
update erp.cxc_pagos cp
set comprobante_adjunto_id = pref.adjunto_id,
    updated_at             = now()
from pref
where cp.id = pref.cxc_pago_id
  and cp.comprobante_adjunto_id is null
`;

async function main() {
  const pg = new Client({ connectionString: SUPABASE_DB_URL });
  await pg.connect();
  try {
    const backfill = await pg.query('SELECT * FROM dilesa.fn_backfill_cxc()');
    console.log('fn_backfill_cxc:');
    for (const r of backfill.rows as { metrica: string; valor: string }[]) {
      console.log(`  ${r.metrica}: ${r.valor}`);
    }

    const recable = await pg.query(RECABLE_SQL);
    console.log(`adjuntos recableados venta_pago → cxc_pago: ${recable.rowCount}`);

    const comprobantes = await pg.query(COMPROBANTE_SQL);
    console.log(`comprobante_adjunto_id seteados: ${comprobantes.rowCount}`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
