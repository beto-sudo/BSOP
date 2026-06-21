/**
 * import_sanren_recibos.ts
 *
 * Trae el historial de recibos de servicios de la casa del doc Coda de Beto
 * (MaXoDlRxXE / tabla "Recibos" grid-ItvEVXa37s) a `sanren.*` en BSOP.
 * Iniciativa `sanren-servicios` · Sprint 1 (docs/planning/sanren-servicios.md).
 *
 * Flujo (idempotente):
 *   1. UPSERT la propiedad "Casa" (por nombre).
 *   2. UPSERT los 3 servicios Luz/Gas/Agua de esa propiedad (por propiedad_id+tipo).
 *   3. UPSERT cada recibo (por coda_row_id) — re-correr no duplica.
 *
 * Limpieza:
 *   - monto: `Cantitad` está marcado USD en Coda por error → es MXN.
 *   - periodo: primer día del mes de `Fecha Recibo` (alineado con el "Nombre" Coda).
 *   - pagado: heurística de historial = hay monto (Coda no tiene flag de pago).
 *   - consumo/producción del periodo NO se almacenan: los deriva sanren.v_recibos.
 *
 * Los adjuntos (PDF de recibo + comprobante de pago) son del Sprint 2.
 *
 * Uso:
 *   npx tsx scripts/import_sanren_recibos.ts            # dry-run (default)
 *   npx tsx scripts/import_sanren_recibos.ts --apply    # ejecuta
 *
 * Env (lee /Users/Beto/BSOP/.env.local; CODA_API_KEY se puede inyectar inline:
 *   CODA_API_KEY="$(op read 'op://Infrastructure/CODA_API_KEY/credential')" \
 *     npx tsx scripts/import_sanren_recibos.ts --apply):
 *   CODA_API_KEY · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { CodaClient, buildColumnMap, pick, num, str } from '@/lib/coda-api';

dotenv.config({ path: path.resolve('/Users/Beto/BSOP/.env.local') });

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APPLY = process.argv.includes('--apply');

const DOC_ID = 'MaXoDlRxXE';
const TABLE_ID = 'grid-ItvEVXa37s';

const PROPIEDAD = { nombre: 'Casa', tipo: 'casa' as const };

// Mapa: "Tipo de Servicio" en Coda → ficha del servicio en sanren.servicios.
const SERVICIOS: Record<
  string,
  {
    tipo: string;
    proveedor: string;
    unidad_consumo: string;
    tiene_produccion: boolean;
    domiciliado: boolean;
  }
> = {
  Luz: {
    tipo: 'luz',
    proveedor: 'CFE',
    unidad_consumo: 'kWh',
    tiene_produccion: true,
    domiciliado: true,
  },
  Gas: {
    tipo: 'gas',
    proveedor: 'Conagas',
    unidad_consumo: 'm³',
    tiene_produccion: false,
    domiciliado: false,
  },
  Agua: {
    tipo: 'agua',
    proveedor: 'SIMAS',
    unidad_consumo: 'm³',
    tiene_produccion: false,
    domiciliado: false,
  },
};

interface ReciboParsed {
  coda_row_id: string;
  servicioCoda: string; // "Luz" | "Gas" | "Agua"
  periodo: string; // YYYY-MM-01
  fecha_recibo: string; // YYYY-MM-DD
  monto: number | null;
  folio: string | null;
  lectura_consumo: number | null;
  lectura_produccion: number | null;
  pagado: boolean;
  notas: string | null;
}

/** Coda da "2026-05-31T00:00:00.000-05:00"; tomamos la fecha local (primeros 10). */
function localDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function main() {
  if (!CODA_API_KEY) {
    throw new Error(
      'Falta CODA_API_KEY. Inyéctalo: CODA_API_KEY="$(op read \'op://Infrastructure/CODA_API_KEY/credential\')" npx tsx ...'
    );
  }

  const coda = new CodaClient(CODA_API_KEY);
  const cols = await coda.listColumns(DOC_ID, TABLE_ID);
  const colMap = buildColumnMap(cols);
  const rows = await coda.listRowsAll(DOC_ID, TABLE_ID, { valueFormat: 'simple', limit: 500 });

  // ── Parseo + limpieza ──────────────────────────────────────────────────────
  const parsed: ReciboParsed[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const servicioCoda = str(pick(row.values, colMap, 'Tipo de Servicio'));
    const fecha = localDate(pick(row.values, colMap, 'Fecha Recibo'));
    if (!servicioCoda || !SERVICIOS[servicioCoda]) {
      skipped.push(`${row.id}: tipo de servicio desconocido "${servicioCoda}"`);
      continue;
    }
    if (!fecha) {
      skipped.push(`${row.id}: sin Fecha Recibo`);
      continue;
    }
    const monto = num(pick(row.values, colMap, 'Cantitad'));
    parsed.push({
      coda_row_id: row.id,
      servicioCoda,
      periodo: `${fecha.slice(0, 7)}-01`,
      fecha_recibo: fecha,
      monto,
      folio: str(pick(row.values, colMap, 'Numero')),
      lectura_consumo: num(pick(row.values, colMap, 'Lectura Consumo')),
      lectura_produccion: num(pick(row.values, colMap, 'Lectura Producción')),
      pagado: monto !== null, // heurística de historial
      notas: str(pick(row.values, colMap, 'Notes')),
    });
  }

  // ── Meses con >1 recibo del mismo servicio (permitido; solo informativo) ─────
  const seen = new Map<string, string>();
  const multiMes: string[] = [];
  for (const r of parsed) {
    const key = `${r.servicioCoda}|${r.periodo}`;
    if (seen.has(key)) multiMes.push(`${key}: ${seen.get(key)} + ${r.coda_row_id}`);
    else seen.set(key, r.coda_row_id);
  }

  // ── Reporte (siempre) ────────────────────────────────────────────────────────
  console.log(`\n=== IMPORT SANREN · Recibos de servicios (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(
    `Filas Coda: ${rows.length} · parseadas: ${parsed.length} · saltadas: ${skipped.length}`
  );
  if (skipped.length) skipped.forEach((s) => console.log(`  ⚠ skip ${s}`));
  if (multiMes.length) {
    console.log(`\nℹ Meses con >1 recibo del mismo servicio (permitido):`);
    multiMes.forEach((c) => console.log(`  ${c}`));
  }

  // Paridad por servicio (lo que debe cuadrar contra Coda y, post-apply, la DB)
  console.log(`\n=== Resumen por servicio (fuente Coda) ===`);
  for (const sc of Object.keys(SERVICIOS)) {
    const sub = parsed.filter((r) => r.servicioCoda === sc);
    const totalMonto = sub.reduce((a, r) => a + (r.monto ?? 0), 0);
    const fechas = sub.map((r) => r.fecha_recibo).sort();
    console.log(
      `  ${sc.padEnd(5)} n=${String(sub.length).padStart(2)} · Σmonto=$${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ${fechas[0]} → ${fechas[fechas.length - 1]}`
    );
  }

  // Suma por servicio×año (checksum fino)
  console.log(`\n=== Σ monto por servicio × año (checksum) ===`);
  const byKey = new Map<string, number>();
  for (const r of parsed) {
    const k = `${r.servicioCoda} ${r.periodo.slice(0, 4)}`;
    byKey.set(k, (byKey.get(k) ?? 0) + (r.monto ?? 0));
  }
  [...byKey.entries()]
    .sort()
    .forEach(([k, v]) =>
      console.log(`  ${k}: $${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`)
    );

  if (!APPLY) {
    console.log(`\n(dry-run — nada se escribió. Corre con --apply para ejecutar.)`);
    return;
  }

  // ── Escritura ────────────────────────────────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // El schema `sanren` aún no está en los tipos generados — cast puntual tipado
  // (mismo enfoque que lib/peptides.ts, sin `any`).
  type Res<T> = Promise<{ data: T; error: { message: string } | null }>;
  interface SanrenTable {
    upsert(
      values: Record<string, unknown> | Record<string, unknown>[],
      opts?: { onConflict?: string }
    ): {
      select(cols: string): Res<{ id: string }[] | null> & {
        single(): Res<{ id: string } | null>;
      };
    };
    select(cols: string): Res<Record<string, unknown>[] | null>;
  }
  const db = admin.schema('sanren' as never) as unknown as {
    from(t: string): SanrenTable;
  };

  // 1) Propiedad
  const { data: propRow, error: propErr } = await db
    .from('propiedades')
    .upsert({ nombre: PROPIEDAD.nombre, tipo: PROPIEDAD.tipo }, { onConflict: 'nombre' })
    .select('id')
    .single();
  if (propErr || !propRow) throw new Error(`propiedades upsert: ${propErr?.message ?? 'sin fila'}`);
  const propiedadId = propRow.id;
  console.log(`\n✓ Propiedad "${PROPIEDAD.nombre}" → ${propiedadId}`);

  // 2) Servicios → mapa tipoCoda → servicio_id
  const servicioIdByCoda = new Map<string, string>();
  for (const [codaTipo, ficha] of Object.entries(SERVICIOS)) {
    const { data, error } = await db
      .from('servicios')
      .upsert(
        {
          propiedad_id: propiedadId,
          tipo: ficha.tipo,
          proveedor: ficha.proveedor,
          unidad_consumo: ficha.unidad_consumo,
          tiene_produccion: ficha.tiene_produccion,
          domiciliado: ficha.domiciliado,
        },
        { onConflict: 'propiedad_id,tipo' }
      )
      .select('id')
      .single();
    if (error || !data)
      throw new Error(`servicios upsert (${ficha.tipo}): ${error?.message ?? 'sin fila'}`);
    servicioIdByCoda.set(codaTipo, data.id);
    console.log(`✓ Servicio ${ficha.tipo} (${ficha.proveedor}) → ${data.id}`);
  }

  // 3) Recibos
  const payload = parsed.map((r) => ({
    servicio_id: servicioIdByCoda.get(r.servicioCoda)!,
    periodo: r.periodo,
    fecha_recibo: r.fecha_recibo,
    monto: r.monto,
    moneda: 'MXN',
    folio: r.folio,
    lectura_consumo: r.lectura_consumo,
    lectura_produccion: r.lectura_produccion,
    pagado: r.pagado,
    notas: r.notas,
    coda_row_id: r.coda_row_id,
  }));
  const { data: recData, error: recErr } = await db
    .from('recibos')
    .upsert(payload, { onConflict: 'coda_row_id' })
    .select('id');
  if (recErr) throw new Error(`recibos upsert: ${recErr.message}`);
  console.log(`\n✓ Recibos upserted: ${recData?.length ?? 0}`);

  // 4) Paridad post-apply: Σ monto por servicio desde la DB vs Coda
  console.log(`\n=== Paridad DB vs Coda (Σ monto por servicio) ===`);
  const { data: dbRows, error: vErr } = await db
    .from('v_recibos')
    .select('servicio_tipo, monto, consumo_periodo');
  if (vErr) throw new Error(`v_recibos select: ${vErr.message}`);
  const dbByTipo = new Map<string, number>();
  for (const r of (dbRows ?? []) as { servicio_tipo: string; monto: number | null }[]) {
    dbByTipo.set(r.servicio_tipo, (dbByTipo.get(r.servicio_tipo) ?? 0) + (r.monto ?? 0));
  }
  for (const [codaTipo, ficha] of Object.entries(SERVICIOS)) {
    const coda = parsed
      .filter((r) => r.servicioCoda === codaTipo)
      .reduce((a, r) => a + (r.monto ?? 0), 0);
    const db2 = dbByTipo.get(ficha.tipo) ?? 0;
    const ok = Math.abs(coda - db2) < 0.005;
    console.log(
      `  ${ficha.tipo.padEnd(5)} Coda=$${coda.toFixed(2)} · DB=$${db2.toFixed(2)} ${ok ? '✓' : '✗ MISMATCH'}`
    );
  }
  console.log('\nListo.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
