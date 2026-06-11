/**
 * check_dilesa_costo_materiales_sync.ts
 *
 * Auditoría READ-ONLY pre-cutoff: compara "Costo Materiales" del grid
 * Construcción por Lote en Coda (grid-CkajhVirlg) contra
 * dilesa.construccion.costo_materiales, fila por fila vía coda_row_id.
 *
 * No escribe nada. Clasifica:
 *   - FALTANTE  — Coda tiene valor > 0, BSOP está NULL (no pasó el sync)
 *   - MISMATCH  — Coda tiene valor > 0, BSOP tiene otro valor (corrigieron en Coda)
 *   - SIN_MATCH — Coda tiene valor > 0 pero no hay fila BSOP con ese coda_row_id
 *   - SOLO_BSOP — BSOP tiene valor, Coda vacío/0 (captura directa en BSOP, informativo)
 *   - OK        — iguales (tolerancia $0.01)
 *
 * Uso:
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/check_dilesa_costo_materiales_sync.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, num } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? process.env.CODA_API_TOKEN ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const CODA_DOC = 'ZNxWl_DI2D';
const T_CONSTRUCCION = 'grid-CkajhVirlg';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY o CODA_API_TOKEN');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── 1. Coda: todas las filas con su Costo Materiales ─────────────────
  const cols = await coda.listColumns(CODA_DOC, T_CONSTRUCCION);
  const cm = buildColumnMap(cols);
  console.log('Cargando filas de Coda (puede tardar ~30s)...');
  const rows = await coda.listRowsAll(CODA_DOC, T_CONSTRUCCION);
  console.log(`Coda: ${rows.length} filas en Construcción por Lote.`);

  const codaPorRowId = new Map<string, { costo: number | null; nombre: string }>();
  for (const row of rows) {
    const costo = num(
      pick(row.values, cm, 'Costo Materiales', 'Costo de Materiales', 'Materiales')
    );
    const nombre = String(
      pick(row.values, cm, 'ID Construcción', 'ID Construccion', 'Name', 'Nombre') ?? row.name ?? ''
    );
    codaPorRowId.set(row.id, { costo: costo != null && costo > 0 ? costo : null, nombre });
  }
  const codaConCosto = [...codaPorRowId.values()].filter((v) => v.costo != null).length;
  console.log(`Coda: ${codaConCosto} filas con Costo Materiales > 0.\n`);

  // ── 2. BSOP: construcciones (paginado, >1000 filas) ──────────────────
  type Fila = {
    id: string;
    codigo: string;
    coda_row_id: string | null;
    costo_materiales: number | null;
    estado: string;
    fecha_terminada: string | null;
  };
  const bsop: Fila[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .schema('dilesa')
      .from('construccion')
      .select('id, codigo, coda_row_id, costo_materiales, estado, fecha_terminada')
      .is('deleted_at', null)
      .order('codigo')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Error leyendo construccion: ${error.message}`);
    bsop.push(...((data ?? []) as Fila[]));
    if (!data || data.length < PAGE) break;
  }
  console.log(`BSOP: ${bsop.length} construcciones activas.`);
  const bsopConCosto = bsop.filter((f) => f.costo_materiales != null && f.costo_materiales > 0);
  console.log(`BSOP: ${bsopConCosto.length} con costo_materiales > 0.\n`);

  // ── 3. Clasificación ──────────────────────────────────────────────────
  const bsopPorCodaRow = new Map(bsop.filter((f) => f.coda_row_id).map((f) => [f.coda_row_id!, f]));

  const faltantes: { nombre: string; codaRowId: string; costoCoda: number; fila: Fila }[] = [];
  const mismatches: {
    nombre: string;
    codaRowId: string;
    costoCoda: number;
    costoBsop: number;
    fila: Fila;
  }[] = [];
  const sinMatch: { nombre: string; codaRowId: string; costoCoda: number }[] = [];
  let ok = 0;

  for (const [rowId, codaVal] of codaPorRowId) {
    if (codaVal.costo == null) continue;
    const fila = bsopPorCodaRow.get(rowId);
    if (!fila) {
      sinMatch.push({ nombre: codaVal.nombre, codaRowId: rowId, costoCoda: codaVal.costo });
    } else if (fila.costo_materiales == null || fila.costo_materiales === 0) {
      faltantes.push({
        nombre: codaVal.nombre,
        codaRowId: rowId,
        costoCoda: codaVal.costo,
        fila,
      });
    } else if (Math.abs(fila.costo_materiales - codaVal.costo) > 0.01) {
      mismatches.push({
        nombre: codaVal.nombre,
        codaRowId: rowId,
        costoCoda: codaVal.costo,
        costoBsop: fila.costo_materiales,
        fila,
      });
    } else {
      ok++;
    }
  }

  const soloBsop = bsopConCosto.filter((f) => {
    if (!f.coda_row_id) return true;
    const codaVal = codaPorRowId.get(f.coda_row_id);
    return !codaVal || codaVal.costo == null;
  });

  // ── 4. Universo post-cutoff: terminadas sin costo ─────────────────────
  const ESTADOS_TERMINADA = ['terminada', 'dtu', 'seguro_calidad', 'extraida'];
  const terminadasSinCosto = bsop.filter(
    (f) =>
      ESTADOS_TERMINADA.includes(f.estado) &&
      (f.costo_materiales == null || f.costo_materiales === 0)
  );
  const enProcesoSinCosto = bsop.filter(
    (f) =>
      !ESTADOS_TERMINADA.includes(f.estado) &&
      (f.costo_materiales == null || f.costo_materiales === 0)
  );

  // ── 5. Reporte ────────────────────────────────────────────────────────
  console.log('═'.repeat(72));
  console.log('RESUMEN DEL SYNC — Coda "Construcción por Lote" vs dilesa.construccion');
  console.log('═'.repeat(72));
  console.log(`  OK (iguales):        ${ok}`);
  console.log(`  FALTANTES:           ${faltantes.length}  (Coda tiene costo, BSOP NULL)`);
  console.log(`  MISMATCH:            ${mismatches.length}  (valor distinto Coda vs BSOP)`);
  console.log(`  SIN MATCH en BSOP:   ${sinMatch.length}  (coda_row_id no existe en BSOP)`);
  console.log(`  SOLO BSOP:           ${soloBsop.length}  (capturadas directo en BSOP)`);
  console.log('');
  console.log(`  Terminadas/DTU/seguro/extraída SIN costo: ${terminadasSinCosto.length}`);
  console.log(`  En proceso SIN costo:                     ${enProcesoSinCosto.length}`);

  if (faltantes.length) {
    console.log('\n── FALTANTES (capturado en Coda, no está en BSOP) ──');
    for (const f of faltantes) {
      console.log(
        `  ${f.fila.codigo.padEnd(28)} ${fmt(f.costoCoda).padStart(15)}  estado=${f.fila.estado}  coda=${f.codaRowId}`
      );
    }
  }

  if (mismatches.length) {
    console.log('\n── MISMATCHES (Coda ≠ BSOP — ¿corrigieron en Coda después del sync?) ──');
    for (const m of mismatches) {
      console.log(
        `  ${m.fila.codigo.padEnd(28)} Coda ${fmt(m.costoCoda).padStart(15)}  vs BSOP ${fmt(m.costoBsop).padStart(15)}  (Δ ${fmt(m.costoCoda - m.costoBsop)})`
      );
    }
  }

  if (sinMatch.length) {
    console.log('\n── SIN MATCH (fila Coda con costo, sin construcción BSOP ligada) ──');
    for (const s of sinMatch) {
      console.log(
        `  ${(s.nombre || '(sin nombre)').padEnd(40)} ${fmt(s.costoCoda).padStart(15)}  coda=${s.codaRowId}`
      );
    }
  }

  console.log('\nListo. (Auditoría read-only, no se escribió nada.)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
