/**
 * import_dilesa_ruv.ts
 *
 * Iniciativa `dilesa-ruv` · Sprints 2 y 4 — import desde Coda (doc ZNxWl_DI2D).
 *
 * Carga el módulo RUV con el alcance mínimo del Sprint 0: solo la OFERTA y el
 * CATÁLOGO de documentos (el detalle por vivienda —CUV + hitos— ya vive en
 * dilesa.construccion, no se re-importa). Tres pasos:
 *
 *   1. Frentes (Coda "Frente RUV" grid-blmDCCczmb → dilesa.ruv_frentes)
 *      - resuelve proyecto_id por nombre de Fraccionamiento → dilesa.proyectos
 *      - idempotente por coda_id (upsert por PK resolviendo el id existente)
 *   2. Catálogo (Coda "Documentos Necesarios" grid-QmS5nK8G4f →
 *      dilesa.ruv_documentos_catalogo) — upsert por (empresa_id, nombre)
 *   3. Backfill dilesa.unidades.frente_id desde la columna "Frente RUV" de la
 *      tabla Inventario de Coda (grid--AHYMPQI7Z), ligando por "ID Lote" =
 *      dilesa.unidades.identificador. Cubre TODOS los lotes (con y sin
 *      construcción) — Sprint 4 movió la liga lote→frente a unidades.
 *
 * Urgencias RUV NO se importa (es un reporte en canvas, va después).
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_ruv.ts   # no escribe, solo reporta
 *   npx tsx scripts/import_dilesa_ruv.ts             # aplica
 */

import { createClient } from '@supabase/supabase-js';

import { CodaClient, buildColumnMap, pick, str, int, dateStr } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_FRENTE_RUV = 'grid-blmDCCczmb';
const CODA_DOCUMENTOS = 'grid-QmS5nK8G4f';
const CODA_INVENTARIO = 'grid--AHYMPQI7Z';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Normaliza nombres de frente para el match (trim + colapsa espacios + upper). */
function normNombre(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const log = (...a: unknown[]) => console.log(DRY_RUN ? '[dry-run]' : '[apply]', ...a);

  // ── empresa DILESA ──────────────────────────────────────────────────────
  const { data: empresa, error: eErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .maybeSingle();
  if (eErr) throw eErr;
  if (!empresa) throw new Error('No se encontró la empresa DILESA');
  const empresaId = empresa.id as string;

  // ── mapa de proyectos por nombre (para resolver Fraccionamiento) ─────────
  const { data: proyectos, error: pErr } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  if (pErr) throw pErr;
  const proyectoPorNombre = new Map<string, string>();
  for (const p of proyectos ?? []) {
    const key = normNombre(p.nombre as string);
    if (!proyectoPorNombre.has(key)) proyectoPorNombre.set(key, p.id as string);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 1 — Frentes
  // ─────────────────────────────────────────────────────────────────────────
  const frenteCols = await coda.listColumns(CODA_DOC, CODA_FRENTE_RUV);
  const frenteMap = buildColumnMap(frenteCols);
  const frenteRows = await coda.listRowsAll(CODA_DOC, CODA_FRENTE_RUV, { limit: 500 });

  let sinNombre = 0;
  let sinProyecto = 0;
  const frentesParaCargar = [];
  for (const row of frenteRows) {
    const nombre = str(pick(row.values, frenteMap, 'Frente RUV'));
    if (!nombre) {
      sinNombre++;
      continue;
    }
    const fracc = str(pick(row.values, frenteMap, 'Fraccionamiento'));
    const proyectoId = fracc ? (proyectoPorNombre.get(normNombre(fracc)) ?? null) : null;
    if (fracc && !proyectoId) sinProyecto++;
    frentesParaCargar.push({
      empresa_id: empresaId,
      proyecto_id: proyectoId,
      nombre,
      id_oferta: int(pick(row.values, frenteMap, 'ID Oferta')),
      id_orden: int(pick(row.values, frenteMap, 'ID Orden')),
      fecha_inicio: dateStr(pick(row.values, frenteMap, 'Fecha Inicio')),
      fecha_fin: dateStr(pick(row.values, frenteMap, 'Fecha Fin')),
      viviendas_oferta: int(pick(row.values, frenteMap, 'Viviendas en Oferta')),
      coda_id: row.id,
    });
  }
  log(
    `Frentes: ${frenteRows.length} filas en Coda → ${frentesParaCargar.length} con nombre ` +
      `(${sinNombre} vacías omitidas; ${sinProyecto} sin proyecto resuelto)`
  );

  // Resolver id existente por coda_id para upsert idempotente por PK.
  const { data: existentes, error: exErr } = await sb
    .schema('dilesa')
    .from('ruv_frentes')
    .select('id, coda_id')
    .eq('empresa_id', empresaId);
  if (exErr) throw exErr;
  const idPorCoda = new Map<string, string>();
  for (const r of existentes ?? []) {
    if (r.coda_id) idPorCoda.set(r.coda_id as string, r.id as string);
  }
  const frentesUpsert = frentesParaCargar.map((f) => {
    const existingId = idPorCoda.get(f.coda_id);
    return existingId ? { id: existingId, ...f } : f;
  });

  if (!DRY_RUN) {
    const { error } = await sb
      .schema('dilesa')
      .from('ruv_frentes')
      .upsert(frentesUpsert, { onConflict: 'id' });
    if (error) throw error;
  }
  log(`Frentes upsert: ${frentesUpsert.length} (${idPorCoda.size} ya existían)`);

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 2 — Catálogo de documentos
  // ─────────────────────────────────────────────────────────────────────────
  const docCols = await coda.listColumns(CODA_DOC, CODA_DOCUMENTOS);
  const docMap = buildColumnMap(docCols);
  const docRows = await coda.listRowsAll(CODA_DOC, CODA_DOCUMENTOS, { limit: 500 });

  const docsUpsert = [];
  let orden = 0;
  for (const row of docRows) {
    const nombre = str(pick(row.values, docMap, 'Documento'));
    if (!nombre) continue;
    orden += 1;
    docsUpsert.push({
      empresa_id: empresaId,
      nombre,
      orden,
      descripcion: str(pick(row.values, docMap, 'Descripción')),
      activo: true,
    });
  }
  if (!DRY_RUN) {
    const { error } = await sb
      .schema('dilesa')
      .from('ruv_documentos_catalogo')
      .upsert(docsUpsert, { onConflict: 'empresa_id,nombre' });
    if (error) throw error;
  }
  log(`Catálogo documentos: ${docsUpsert.length} tipos upsert`);

  // ─────────────────────────────────────────────────────────────────────────
  // PASO 3 — Backfill unidades.frente_id desde Coda Inventario (todos los lotes)
  // ─────────────────────────────────────────────────────────────────────────
  // La liga lote→frente vive en dilesa.unidades.frente_id. La fuente completa
  // (lotes con y sin construcción) es la columna "Frente RUV" de la tabla
  // Inventario de Coda, ligada por "ID Lote" (= dilesa.unidades.identificador).
  const frenteIdPorNombre = new Map<string, string>();
  const unidadIdPorIdent = new Map<string, string>();
  if (!DRY_RUN) {
    const [frentesDb, unidadesDb] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ruv_frentes')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, identificador')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);
    if (frentesDb.error) throw frentesDb.error;
    if (unidadesDb.error) throw unidadesDb.error;
    for (const f of frentesDb.data ?? []) {
      const key = normNombre(f.nombre as string);
      if (!frenteIdPorNombre.has(key)) frenteIdPorNombre.set(key, f.id as string);
    }
    for (const u of unidadesDb.data ?? []) {
      const ident = str(u.identificador);
      if (ident) unidadIdPorIdent.set(ident.trim().toUpperCase(), u.id as string);
    }
  } else {
    for (const f of frentesParaCargar) {
      const key = normNombre(f.nombre);
      if (!frenteIdPorNombre.has(key)) frenteIdPorNombre.set(key, 'dry-run');
    }
  }

  const invCols = await coda.listColumns(CODA_DOC, CODA_INVENTARIO);
  const invMap = buildColumnMap(invCols);
  const invRows = await coda.listRowsAll(CODA_DOC, CODA_INVENTARIO, { limit: 500 });

  // Agrupar ids de unidad por frente resuelto.
  const idsPorFrente = new Map<string, string[]>();
  let sinFrenteTexto = 0; // filas de inventario sin "Frente RUV"
  let sinFrenteMatch = 0; // "Frente RUV" que no resuelve a un frente cargado
  let sinUnidad = 0; // "ID Lote" que no resuelve a una unidad en BSOP
  for (const row of invRows) {
    const frenteTexto = str(pick(row.values, invMap, 'Frente RUV'));
    if (!frenteTexto) {
      sinFrenteTexto++;
      continue;
    }
    const fid = frenteIdPorNombre.get(normNombre(frenteTexto));
    if (!fid) {
      sinFrenteMatch++;
      continue;
    }
    const idLote = str(pick(row.values, invMap, 'ID Lote'));
    const uid = DRY_RUN
      ? 'dry-run'
      : idLote
        ? unidadIdPorIdent.get(idLote.trim().toUpperCase())
        : undefined;
    if (!uid) {
      sinUnidad++;
      continue;
    }
    if (!idsPorFrente.has(fid)) idsPorFrente.set(fid, []);
    idsPorFrente.get(fid)!.push(uid);
  }
  const totalLigar = [...idsPorFrente.values()].reduce((acc, ids) => acc + ids.length, 0);
  log(
    `Backfill unidades.frente_id: ${totalLigar} lotes ligados ` +
      `(${sinFrenteTexto} sin Frente RUV en Coda, ${sinFrenteMatch} Frente sin match, ${sinUnidad} lote sin unidad en BSOP)`
  );

  if (!DRY_RUN) {
    for (const [fid, ids] of idsPorFrente) {
      // Chunk para no exceder límites de URL en el filtro .in().
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        const { error } = await sb
          .schema('dilesa')
          .from('unidades')
          .update({ frente_id: fid })
          .in('id', chunk);
        if (error) throw error;
      }
    }
  }

  log('✔ Import RUV completo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
