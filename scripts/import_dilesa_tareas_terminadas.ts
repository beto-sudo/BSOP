/**
 * import_dilesa_tareas_terminadas.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — Script E.
 * Importa el log append-only de tareas terminadas desde Coda DILESA
 * (doc ZNxWl_DI2D, tabla grid-fJSixLw1DF "Tareas Terminadas") hacia
 * dilesa.construccion_tareas_terminadas.
 *
 * Volumen estimado: ~750k filas. Estrategia para evitar 750k recálculos
 * del trigger tg_construccion_avance:
 *
 *   1. ALTER TABLE ... DISABLE TRIGGER tg_construccion_avance.
 *   2. Cargar set de coda_row_id ya existentes en BSOP.
 *   3. Filtrar a "solo nuevas" + bulk INSERT por batches de 500.
 *   4. ALTER TABLE ... ENABLE TRIGGER tg_construccion_avance.
 *   5. UPDATE dilesa.construccion SET avance_pct =
 *        dilesa.fn_calcular_avance_construccion(id) (un UPDATE por obra).
 *
 * Por qué INSERT solo (vs UPSERT): el trigger tg_ctt_lock_pagadas (ADR-033 D8,
 * migración 20260525221141) bloquea UPDATE/DELETE de tareas vinculadas a una
 * estimación pagada. Como UPSERT con ON CONFLICT DO UPDATE intenta UPDATE
 * cuando ya existe el row, todo el chunk falla aunque el INSERT puro pasaría.
 * Solo INSERT de las nuevas respeta el lock por construcción: las pagadas
 * "no se tocan" (regla del negocio) y las nuevas entran sin choque.
 *
 * Edits de Coda en tareas ya importadas se ignoran. Si requieres refrescar
 * una tarea específica (corrección de fecha, mano de obra, etc.), pídelo a
 * Dirección — mismo flujo que el lock_pagadas exige.
 *
 * Lookup plantilla_tarea_id:
 *   - "Tarea Terminada" en Coda viene como "ETAPA-Nombre de tarea".
 *   - Split por primer "-" → etapa + tarea.
 *   - Buscar en plantilla_tareas WHERE producto_id = construccion.producto_id
 *     AND etapa.nombre = X AND tarea.nombre = Y.
 *   - Si no resuelve, skip + reporta.
 *
 * Idempotente: INSERT solo de coda_row_id no vistos. Re-runs son no-op.
 *
 * Prerequisites:
 *   - Construcción ya importada (Script D).
 *   - Plantilla ya importada (Script A).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_tareas_terminadas.ts
 *   npx tsx scripts/import_dilesa_tareas_terminadas.ts
 */

import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, dateStr, bool } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_TAREAS_TERMINADAS = 'grid-fJSixLw1DF';

/**
 * Split "ETAPA-tarea" → {etapa, tarea}.
 *
 * Usa longest-prefix-match contra `etapasOrdenadas` (lista de etapas conocidas
 * ordenada por longitud DESC) porque algunas etapas contienen guion en el
 * nombre — ej. "INSTALACIÓN HIDRO-SANITARIA". Si splitea por primer guión,
 * la etapa queda mal ("INSTALACIÓN HIDRO") y el lookup en plantilla_tareas
 * falla siempre — bug histórico que dejó ~1,038 tareas sin importar.
 *
 * Fallback al primer guión solo si ninguna etapa conocida matchea (defensivo:
 * permite que rows con etapas nuevas se reporten en `skipPlantilla` y no se
 * pierdan silenciosamente con `null`).
 *
 * Exportado para tests.
 */
export function splitTareaTerminada(
  s: string,
  etapasOrdenadas: readonly string[]
): { etapa: string; tarea: string } | null {
  const sLower = s.toLowerCase();
  for (const etapa of etapasOrdenadas) {
    const prefix = (etapa + '-').toLowerCase();
    if (sLower.startsWith(prefix)) {
      return { etapa, tarea: s.slice(etapa.length + 1).trim() };
    }
  }
  const dash = s.indexOf('-');
  if (dash < 1) return null;
  return {
    etapa: s.slice(0, dash).trim(),
    tarea: s.slice(dash + 1).trim(),
  };
}

async function main() {
  if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');
  if (!SUPABASE_DB_URL)
    throw new Error('Falta SUPABASE_DB_URL (para disable/enable trigger via psql)');

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

  // ── Lookup construcciones por código ──────────────────────────────────────
  console.log('Cargando lookups...');
  const { data: construcciones, error: cErr } = await sb
    .schema('dilesa')
    .from('construccion')
    .select('id, codigo, producto_id')
    .eq('empresa_id', empresaId);
  if (cErr) throw new Error(`Error leyendo construcciones: ${cErr.message}`);
  const construccionPorCodigo = new Map(
    (construcciones ?? []).map((c) => [
      c.codigo as string,
      { id: c.id as string, producto_id: c.producto_id as string },
    ])
  );
  console.log(`  ${construccionPorCodigo.size} construcciones cargadas.`);

  // ── Plantilla: index por (producto_id, etapa_nombre, tarea_nombre) ────────
  // Cargamos plantilla + JOIN a etapas y tareas; paginamos para no exceder URL.
  console.log('  Cargando plantilla_tareas con JOIN a etapas + tareas...');
  type PlantillaRow = {
    id: string;
    producto_id: string;
    etapa_nombre: string;
    tarea_nombre: string;
  };
  const plantillaRows: PlantillaRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .schema('dilesa')
      .from('plantilla_tareas')
      .select(
        'id, producto_id, etapas_construccion!inner(nombre), tareas_construccion!inner(nombre)'
      )
      .eq('empresa_id', empresaId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Error leyendo plantilla_tareas: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      // supabase-js tipa el join como array aun cuando la FK es to-one.
      // Tomamos el primer (y único) elemento.
      const etapaJoin = (
        r as unknown as {
          etapas_construccion: { nombre: string } | Array<{ nombre: string }>;
        }
      ).etapas_construccion;
      const tareaJoin = (
        r as unknown as {
          tareas_construccion: { nombre: string } | Array<{ nombre: string }>;
        }
      ).tareas_construccion;
      const etapa = Array.isArray(etapaJoin) ? etapaJoin[0] : etapaJoin;
      const tarea = Array.isArray(tareaJoin) ? tareaJoin[0] : tareaJoin;
      if (!etapa?.nombre || !tarea?.nombre) continue;
      plantillaRows.push({
        id: r.id as string,
        producto_id: r.producto_id as string,
        etapa_nombre: etapa.nombre,
        tarea_nombre: tarea.nombre,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  ${plantillaRows.length} plantilla_tareas cargadas.`);

  // Lista única de etapas, ordenada por longitud DESC para longest-prefix-match.
  // Imprescindible para etapas que contienen guion (ej. "INSTALACIÓN HIDRO-SANITARIA").
  const etapasOrdenadas = Array.from(new Set(plantillaRows.map((p) => p.etapa_nombre))).sort(
    (a, b) => b.length - a.length
  );

  // Index: producto_id|etapa|tarea → plantilla_id
  const plantillaPorKey = new Map<string, string>();
  const makeKey = (producto_id: string, etapa: string, tarea: string): string =>
    `${producto_id}|${etapa.toLowerCase().trim()}|${tarea.toLowerCase().trim()}`;
  for (const p of plantillaRows) {
    plantillaPorKey.set(makeKey(p.producto_id, p.etapa_nombre, p.tarea_nombre), p.id);
  }

  // Lookup personas (revisado_por)
  const { data: personas } = await sb
    .schema('erp')
    .from('personas')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  const personaPorNombre = new Map(
    (personas ?? []).map((p) => [(p.nombre as string).trim().toLowerCase(), p.id as string])
  );

  // ── Pull Coda ──────────────────────────────────────────────────────────────
  console.log('\nDescargando tareas terminadas de Coda...');
  const ttCols = await coda.listColumns(CODA_DOC, T_TAREAS_TERMINADAS);
  const ttCm = buildColumnMap(ttCols);
  const ttRows = await coda.listRowsAll(CODA_DOC, T_TAREAS_TERMINADAS, { limit: 500 });
  console.log(`Coda: ${ttRows.length} tareas terminadas.`);

  // ── Parseo + lookup ───────────────────────────────────────────────────────
  let skipConstruccion = 0;
  let skipPlantilla = 0;
  let skipDupCoda = 0;
  let skipFormatoTarea = 0;
  const skipPlantillaSample: string[] = [];
  type InsertRow = {
    empresa_id: string;
    coda_row_id: string;
    construccion_id: string;
    plantilla_tarea_id: string;
    fecha_terminada: string;
    tiempo_real_dias: number | null;
    mano_obra_pagada: number | null;
    revisado_por_persona_id: string | null;
    fecha_pagada: string | null;
  };
  const inserts: InsertRow[] = [];

  for (const row of ttRows) {
    const v = row.values;

    // Skip los marcados como duplicado en Coda
    if (bool(pick(v, ttCm, 'Tiene Duplicados'))) {
      skipDupCoda++;
      continue;
    }

    const codigoConst = str(pick(v, ttCm, 'ID Construcción'));
    if (!codigoConst) continue;
    const construccion = construccionPorCodigo.get(codigoConst);
    if (!construccion) {
      skipConstruccion++;
      continue;
    }

    const tareaStr = str(pick(v, ttCm, 'Tarea Terminada'));
    if (!tareaStr) continue;
    const split = splitTareaTerminada(tareaStr, etapasOrdenadas);
    if (!split) {
      skipFormatoTarea++;
      continue;
    }

    const plantilla_id = plantillaPorKey.get(
      makeKey(construccion.producto_id, split.etapa, split.tarea)
    );
    if (!plantilla_id) {
      skipPlantilla++;
      if (skipPlantillaSample.length < 10) {
        skipPlantillaSample.push(`${codigoConst} :: ${tareaStr}`);
      }
      continue;
    }

    const fecha = dateStr(pick(v, ttCm, 'Fecha Tarea Terminada'));
    if (!fecha) continue;

    const revisorNombre = str(pick(v, ttCm, 'Revisado Por:'));
    const revisado_por_persona_id = revisorNombre
      ? (personaPorNombre.get(revisorNombre.trim().toLowerCase()) ?? null)
      : null;

    inserts.push({
      empresa_id: empresaId,
      coda_row_id: row.id,
      construccion_id: construccion.id,
      plantilla_tarea_id: plantilla_id,
      fecha_terminada: fecha,
      tiempo_real_dias: num(pick(v, ttCm, 'Tiempo')),
      mano_obra_pagada: num(pick(v, ttCm, 'Mano de Obra')),
      revisado_por_persona_id,
      fecha_pagada: dateStr(pick(v, ttCm, 'Fecha Tarea Pagada')),
    });
  }

  console.log(`  ${inserts.length} a insertar.`);
  console.log(
    `  skip: construccion=${skipConstruccion}, plantilla=${skipPlantilla}, ` +
      `dup=${skipDupCoda}, formato=${skipFormatoTarea}`
  );
  if (skipPlantillaSample.length > 0) {
    console.log(`  Muestra de tareas sin match en plantilla:`);
    for (const s of skipPlantillaSample) console.log(`    · ${s}`);
  }

  // Dedup en memoria: (construccion_id, plantilla_tarea_id) — si Coda tiene
  // dups (típicamente por re-Importar tareas iguales en años distintos),
  // tomar la primera ocurrencia (que es la más antigua = correcta).
  const seen = new Set<string>();
  const insertsDedup: InsertRow[] = [];
  let dedupCount = 0;
  for (const ins of inserts) {
    const k = `${ins.construccion_id}|${ins.plantilla_tarea_id}`;
    if (seen.has(k)) {
      dedupCount++;
      continue;
    }
    seen.add(k);
    insertsDedup.push(ins);
  }
  if (dedupCount > 0) {
    console.log(`  ${dedupCount} dup tareas (mismo construccion+plantilla) — primera gana.`);
  }
  console.log(`  ${insertsDedup.length} efectivamente a insertar.`);

  if (DRY_RUN) {
    console.log('[DRY] no se escribe nada.');
    return;
  }

  // ── DISABLE trigger (via psql directo) ────────────────────────────────────
  console.log('\nConectando a Postgres directo para disable trigger...');
  const pg = new Client({ connectionString: SUPABASE_DB_URL });
  await pg.connect();

  try {
    await pg.query(
      'ALTER TABLE dilesa.construccion_tareas_terminadas DISABLE TRIGGER tg_construccion_avance;'
    );
    console.log('  ✔ Trigger tg_construccion_avance DESHABILITADO.');

    // ── Cargar coda_row_id ya en BSOP (para hacer INSERT-only) ─────────────
    console.log('  Cargando coda_row_id ya existentes en BSOP...');
    const existentesRes = await pg.query<{ coda_row_id: string }>(
      `SELECT coda_row_id
         FROM dilesa.construccion_tareas_terminadas
         WHERE empresa_id = $1 AND coda_row_id IS NOT NULL`,
      [empresaId]
    );
    const existentes = new Set(existentesRes.rows.map((r) => r.coda_row_id));
    const nuevas = insertsDedup.filter((i) => !existentes.has(i.coda_row_id));
    const yaExisten = insertsDedup.length - nuevas.length;
    console.log(
      `  ${existentes.size} ya en BSOP · ${nuevas.length} nuevas a insertar · ${yaExisten} skip (ya existen)`
    );

    // ── Bulk INSERT de nuevas ──────────────────────────────────────────────
    let ok = 0;
    let err = 0;
    const erroresMuestra: string[] = [];
    const CHUNK = 500;
    const startTs = Date.now();
    for (let i = 0; i < nuevas.length; i += CHUNK) {
      const chunk = nuevas.slice(i, i + CHUNK);
      const { error } = await sb
        .schema('dilesa')
        .from('construccion_tareas_terminadas')
        .insert(chunk);
      if (error) {
        if (erroresMuestra.length < 3) {
          erroresMuestra.push(`chunk [${i}..${i + chunk.length}): ${error.message}`);
        }
        err += chunk.length;
        continue;
      }
      ok += chunk.length;
      if (i % 5000 === 0 && i > 0) {
        const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
        console.log(
          `    [${ok}/${nuevas.length}] (${elapsed}s, ${(ok / Math.max(1, (Date.now() - startTs) / 1000)).toFixed(0)} rows/s)`
        );
      }
    }
    console.log(`  ✔ ${ok} INSERT (${err} errores).`);
    if (erroresMuestra.length > 0) {
      console.error('  Muestra de errores:');
      for (const m of erroresMuestra) console.error(`    · ${m}`);
    }

    // ── ENABLE trigger ────────────────────────────────────────────────────
    await pg.query(
      'ALTER TABLE dilesa.construccion_tareas_terminadas ENABLE TRIGGER tg_construccion_avance;'
    );
    console.log('  ✔ Trigger tg_construccion_avance HABILITADO.');

    // ── Recalc manual de avance_pct por cada construccion ─────────────────
    console.log('\nRecalculando avance_pct de cada construcción...');
    const { rows: avanceRes } = await pg.query<{ updated: number }>(
      `UPDATE dilesa.construccion
         SET avance_pct = dilesa.fn_calcular_avance_construccion(id)
       WHERE empresa_id = $1
       RETURNING 1`,
      [empresaId]
    );
    console.log(`  ✔ ${avanceRes.length} construcciones con avance_pct recalculado.`);

    if (err > 0) {
      throw new Error(
        `${err} tareas terminadas fallaron al insertar (de ${nuevas.length} candidatas nuevas).`
      );
    }
  } finally {
    await pg.end();
  }

  console.log('\n✔ Script E (tareas terminadas) terminado.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
