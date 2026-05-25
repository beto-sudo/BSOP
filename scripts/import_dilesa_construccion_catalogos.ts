/**
 * import_dilesa_construccion_catalogos.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — Script A (catálogos).
 * Importa desde Coda DILESA (doc ZNxWl_DI2D) los 4 catálogos base del
 * módulo construcción:
 *
 *   1. Etapas Construcción (grid-CThW1hcfYn) → dilesa.etapas_construccion
 *   2. Tareas Construcción (grid-w2cUreZ1mG) → dilesa.tareas_construccion
 *      (dedup por nombre).
 *   3. Plantilla Tareas (grid-ger9cXNCKh)    → dilesa.plantilla_tareas
 *      (FK a tarea + etapa + producto, resueltas por nombre en memoria).
 *   4. Prototipos (grid-iGIRvYfGUx) — UPDATE in-place de
 *      dilesa.productos.planos JSONB con las 17 URLs de planos.
 *
 * Idempotente: UPSERT por coda_row_id en las 3 primeras tablas. El paso
 * 4 hace UPDATE por productos.nombre — si el producto no existe, se
 * reporta y se salta.
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_construccion_catalogos.ts
 *   npx tsx scripts/import_dilesa_construccion_catalogos.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, int, firstUrl } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_ETAPAS = 'grid-CThW1hcfYn';
const T_TAREAS = 'grid-w2cUreZ1mG';
const T_PLANTILLA = 'grid-ger9cXNCKh';
const T_PROTOTIPOS = 'grid-iGIRvYfGUx';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** 17 columnas de planos del Prototipo Coda → key del JSONB planos. */
const PLANOS_MAP: Array<[codaCol: string, jsonKey: string]> = [
  ['Plano Arquitectónico Planta Baja', 'arq_planta_baja'],
  ['Plano Arquitectónico Planta Alta', 'arq_planta_alta'],
  ['Plano Arquitectónico Cortes', 'arq_cortes'],
  ['Plano Arquitectónico Elevaciones', 'arq_elevaciones'],
  ['Plano Arquitectónico Detalles Constructivos', 'arq_detalles_constructivos'],
  ['Plano Ejecutivo Desplantes', 'ej_desplantes'],
  ['Plano Ejecutivo Acabados', 'ej_acabados'],
  ['Plano Ejecutivo Carpinteria', 'ej_carpinteria'],
  ['Plano Ejecutivo Canceleria', 'ej_canceleria'],
  ['Plano Ejecutivo Herreria', 'ej_herreria'],
  ['Plano Ejecutivo Detalles', 'ej_detalles'],
  ['Plano Ejecutivo Plafones', 'ej_plafones'],
  ['Plano Ingenieria Estructural', 'ing_estructural'],
  ['Plano Ingenieria Electrica', 'ing_electrica'],
  ['Plano Ingenieria Hidráulica', 'ing_hidraulica'],
  ['Plano Ingenieria Sanitaria', 'ing_sanitaria'],
  ['Plano Ingenieria Gas', 'ing_gas'],
];

/** "0.2100%" → 0.0021. */
function parsePorcentaje(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return 0;
  const pct = parseFloat(cleaned);
  if (!Number.isFinite(pct)) return 0;
  return pct / 100; // "0.2100" entra como 0.21 → dividido = 0.0021
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
  if (empErr || !emp) throw new Error(`No se encontró la empresa DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  // ── 1. Etapas ──────────────────────────────────────────────────────────────
  console.log('\n── 1. Etapas de Construcción ──');
  const etCols = await coda.listColumns(CODA_DOC, T_ETAPAS);
  const etCm = buildColumnMap(etCols);
  const etRows = await coda.listRowsAll(CODA_DOC, T_ETAPAS);
  console.log(`Coda: ${etRows.length} filas en Etapas.`);

  // Dedup por nombre — Coda permite múltiples filas con el mismo nombre de
  // etapa (mismo prototipo distinto). Tomamos la primera ocurrencia.
  const etapasDedup = new Map<
    string,
    { coda_row_id: string; nombre: string; orden: number; dias_estimados: number }
  >();
  let etapasDupes = 0;
  for (const row of etRows) {
    const nombre = str(pick(row.values, etCm, 'Etapa Construcción'));
    if (!nombre) continue;
    if (etapasDedup.has(nombre)) {
      etapasDupes++;
      continue;
    }
    etapasDedup.set(nombre, {
      coda_row_id: row.id,
      nombre,
      orden: int(pick(row.values, etCm, 'Orden de Etapa')) ?? 0,
      dias_estimados: int(pick(row.values, etCm, 'Dias')) ?? 0,
    });
  }
  console.log(`  ${etapasDedup.size} etapas únicas (${etapasDupes} dupes en Coda ignorados).`);

  const etapasInserts = [...etapasDedup.values()].map((e) => ({
    empresa_id: empresaId,
    coda_row_id: e.coda_row_id,
    nombre: e.nombre,
    orden: e.orden,
    dias_estimados: e.dias_estimados,
  }));

  // Map nombre→id para que el paso 3 (plantilla) lookee FKs
  const etapaIdPorNombre = new Map<string, string>();

  if (!DRY_RUN) {
    // onConflict por (empresa_id, nombre) — el nombre es la llave de negocio
    // robusta. coda_row_id es secundario (la UNIQUE de coda_row_id ya está
    // resuelta porque dedupamos por nombre, no por row_id).
    const { data: upEt, error: etErr } = await sb
      .schema('dilesa')
      .from('etapas_construccion')
      .upsert(etapasInserts, { onConflict: 'empresa_id,nombre' })
      .select('id, nombre');
    if (etErr) throw new Error(`Error UPSERT etapas: ${etErr.message}`);
    for (const r of upEt ?? []) etapaIdPorNombre.set(r.nombre as string, r.id as string);
    console.log(`  ✔ UPSERT ${upEt?.length ?? 0} etapas.`);
  } else {
    console.log(`  [DRY] insertaría ${etapasInserts.length} etapas.`);
  }

  // ── 2. Tareas (dedup por nombre) ───────────────────────────────────────────
  console.log('\n── 2. Tareas de Construcción ──');
  const tCols = await coda.listColumns(CODA_DOC, T_TAREAS);
  const tCm = buildColumnMap(tCols);
  const tRows = await coda.listRowsAll(CODA_DOC, T_TAREAS);
  console.log(`Coda: ${tRows.length} filas en Tareas.`);

  // Dedup por nombre — quedamos con la primera ocurrencia (mismo nombre =
  // misma semántica). Reportamos dupes.
  const tareasDedup = new Map<string, { row_id: string; nombre: string }>();
  let tareasDupes = 0;
  for (const row of tRows) {
    const nombre = str(pick(row.values, tCm, 'Tarea de Construccion'));
    if (!nombre) continue;
    if (tareasDedup.has(nombre)) {
      tareasDupes++;
      continue;
    }
    tareasDedup.set(nombre, { row_id: row.id, nombre });
  }
  console.log(`  ${tareasDedup.size} tareas únicas (${tareasDupes} dupes en Coda ignorados).`);

  const tareasInserts = [...tareasDedup.values()].map((t) => ({
    empresa_id: empresaId,
    coda_row_id: t.row_id,
    nombre: t.nombre,
  }));

  // Map nombre→id para el paso 3
  const tareaIdPorNombre = new Map<string, string>();
  if (!DRY_RUN) {
    // UPSERT con onConflict por (empresa_id, nombre) — la llave de negocio
    // robusta para idempotencia. coda_row_id es secundario.
    let okT = 0;
    const CHUNK = 200;
    for (let i = 0; i < tareasInserts.length; i += CHUNK) {
      const chunk = tareasInserts.slice(i, i + CHUNK);
      const { data: upT, error: tErr } = await sb
        .schema('dilesa')
        .from('tareas_construccion')
        .upsert(chunk, { onConflict: 'empresa_id,nombre' })
        .select('id, nombre');
      if (tErr) {
        console.error(`  ✗ chunk tareas [${i}..${i + chunk.length}): ${tErr.message}`);
        continue;
      }
      for (const r of upT ?? []) tareaIdPorNombre.set(r.nombre as string, r.id as string);
      okT += chunk.length;
    }
    console.log(`  ✔ UPSERT ${okT} tareas.`);
  } else {
    console.log(`  [DRY] insertaría ${tareasInserts.length} tareas.`);
  }

  // ── 3. Plantilla tareas ────────────────────────────────────────────────────
  console.log('\n── 3. Plantilla de Tareas por Prototipo ──');
  const plCols = await coda.listColumns(CODA_DOC, T_PLANTILLA);
  const plCm = buildColumnMap(plCols);
  const plRows = await coda.listRowsAll(CODA_DOC, T_PLANTILLA);
  console.log(`Coda: ${plRows.length} filas en Plantilla.`);

  // Map productos por nombre para FK
  const { data: productos, error: prErr } = await sb
    .schema('dilesa')
    .from('productos')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  if (prErr) throw new Error(`Error leyendo productos: ${prErr.message}`);
  const productoIdPorNombre = new Map(
    (productos ?? []).map((p) => [(p.nombre as string).trim(), p.id as string])
  );

  // Si DRY_RUN, los maps de etapa/tarea están vacíos → cargar para validar
  if (DRY_RUN) {
    const { data: etL } = await sb
      .schema('dilesa')
      .from('etapas_construccion')
      .select('id, nombre')
      .eq('empresa_id', empresaId);
    for (const r of etL ?? []) etapaIdPorNombre.set(r.nombre as string, r.id as string);
    const { data: tL } = await sb
      .schema('dilesa')
      .from('tareas_construccion')
      .select('id, nombre')
      .eq('empresa_id', empresaId);
    for (const r of tL ?? []) tareaIdPorNombre.set(r.nombre as string, r.id as string);
  }

  let plSkipProducto = 0;
  let plSkipTarea = 0;
  let plSkipEtapa = 0;
  const plantillaInserts: Array<Record<string, unknown>> = [];

  for (const row of plRows) {
    const v = row.values;
    const productoNombre = str(pick(v, plCm, 'Prototipo'));
    const tareaNombre = str(pick(v, plCm, 'Tarea Construcción'));
    const etapaNombre = str(pick(v, plCm, 'Etapa Construcción'));
    if (!productoNombre || !tareaNombre || !etapaNombre) continue;

    const producto_id = productoIdPorNombre.get(productoNombre.trim());
    if (!producto_id) {
      plSkipProducto++;
      continue;
    }
    const tarea_id = tareaIdPorNombre.get(tareaNombre);
    if (!tarea_id) {
      plSkipTarea++;
      continue;
    }
    const etapa_id = etapaIdPorNombre.get(etapaNombre);
    if (!etapa_id) {
      plSkipEtapa++;
      continue;
    }

    plantillaInserts.push({
      empresa_id: empresaId,
      coda_row_id: row.id,
      producto_id,
      tarea_id,
      etapa_id,
      porcentaje_costo: parsePorcentaje(pick(v, plCm, 'Porcentaje de Costo')),
      costo_mo_plantilla: num(pick(v, plCm, 'Costo MO')) ?? 0,
      tiempo_dias: num(pick(v, plCm, 'Tiempo')) ?? 0,
    });
  }

  console.log(
    `  ${plantillaInserts.length} plantilla rows; ` +
      `skip producto:${plSkipProducto} tarea:${plSkipTarea} etapa:${plSkipEtapa}`
  );

  if (!DRY_RUN) {
    let okPl = 0;
    const CHUNK = 300;
    for (let i = 0; i < plantillaInserts.length; i += CHUNK) {
      const chunk = plantillaInserts.slice(i, i + CHUNK);
      // UNIQUE real: (producto_id, tarea_id, etapa_id). Eso conflicta de Coda
      // a Coda; usamos esa llave como onConflict.
      const { error: plErr } = await sb
        .schema('dilesa')
        .from('plantilla_tareas')
        .upsert(chunk, { onConflict: 'producto_id,tarea_id,etapa_id' });
      if (plErr) {
        console.error(`  ✗ chunk plantilla [${i}..${i + chunk.length}): ${plErr.message}`);
        continue;
      }
      okPl += chunk.length;
    }
    console.log(`  ✔ UPSERT ${okPl} plantilla_tareas.`);
  }

  // ── 4. Prototipos → productos.planos ──────────────────────────────────────
  console.log('\n── 4. Planos de Prototipos (UPDATE productos.planos) ──');
  const ptCols = await coda.listColumns(CODA_DOC, T_PROTOTIPOS);
  const ptCm = buildColumnMap(ptCols);
  const ptRows = await coda.listRowsAll(CODA_DOC, T_PROTOTIPOS);
  console.log(`Coda: ${ptRows.length} prototipos.`);

  let prodOk = 0;
  let prodSkip = 0;
  let prodSinPlanos = 0;

  for (const row of ptRows) {
    const v = row.values;
    const idProto = str(pick(v, ptCm, 'ID Prototipo')) ?? row.name;
    if (!idProto) {
      prodSkip++;
      continue;
    }
    const producto_id = productoIdPorNombre.get(idProto.trim());
    if (!producto_id) {
      console.warn(`  ⚠ prototipo "${idProto}": producto no encontrado en BSOP — skip`);
      prodSkip++;
      continue;
    }

    const planos: Record<string, string> = {};
    for (const [codaCol, jsonKey] of PLANOS_MAP) {
      const url = firstUrl(pick(v, ptCm, codaCol));
      if (url) planos[jsonKey] = url;
    }

    if (Object.keys(planos).length === 0) {
      prodSinPlanos++;
      continue;
    }

    if (!DRY_RUN) {
      const { error } = await sb
        .schema('dilesa')
        .from('productos')
        .update({ planos })
        .eq('id', producto_id);
      if (error) {
        console.error(`  ✗ UPDATE planos ${idProto}: ${error.message}`);
        continue;
      }
    }
    prodOk++;
  }

  console.log(
    `  ✔ ${prodOk} productos con planos cargados (${prodSinPlanos} sin planos en Coda, ${prodSkip} sin match).`
  );

  console.log('\n✔ Script A (catálogos) terminado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
