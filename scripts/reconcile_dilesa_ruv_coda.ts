/**
 * reconcile_dilesa_ruv_coda.ts
 *
 * Iniciativa `dilesa-ruv` · cutoff de Coda. Comparativo de reconciliación entre
 * las tablas RUV de Coda (doc ZNxWl_DI2D) y lo migrado a BSOP, para confirmar
 * ANTES de cerrar el acceso a Coda que toda la información coincide.
 *
 * NO modifica nada — solo lee ambos lados y reporta discrepancias. Cuatro
 * comparativos:
 *   1. Frentes        — Coda "Frente RUV"          ↔ dilesa.ruv_frentes (por coda_id)
 *   2. Catálogo docs  — Coda "Documentos Necesarios" ↔ dilesa.ruv_documentos_catalogo
 *   3. CUVs           — Coda "CUV" + Inventario.CUV  ↔ dilesa.unidades.cuv
 *   4. Lotes→frente   — Coda Inventario (ID Lote→Frente) ↔ dilesa.unidades.frente_id
 *
 * Uso:
 *   CODA_API_KEY=$(op read "op://Infrastructure/CODA_API_KEY/credential") \
 *   NEXT_PUBLIC_SUPABASE_URL="https://ybklderteyhuugzfmxbi.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY=$(op read "op://Infrastructure/SUPABASE_SERVICE_ROLE_KEY/credential") \
 *     npx tsx scripts/reconcile_dilesa_ruv_coda.ts
 */

import { createClient } from '@supabase/supabase-js';

import { CodaClient, buildColumnMap, pick, str, int } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_FRENTE_RUV = 'grid-blmDCCczmb';
const CODA_DOCUMENTOS = 'grid-QmS5nK8G4f';
const CODA_CUV = 'grid-Z75H_uv0ZJ';
const CODA_INVENTARIO = 'grid--AHYMPQI7Z';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
const isCuv = (s: string | null) => !!s && /^\d{16}$/.test(s.trim());

/** Lee TODAS las filas de una tabla de BSOP paginando (supabase-js limita a 1000). */
async function readAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const P = (...a: unknown[]) => console.log(...a);

  // empresa DILESA
  const { data: empresa } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .maybeSingle();
  if (!empresa) throw new Error('No se encontró DILESA');
  const empresaId = empresa.id as string;

  P('\n══════════════════════════════════════════════════════════════');
  P('  RECONCILIACIÓN RUV — Coda ↔ BSOP');
  P('══════════════════════════════════════════════════════════════');

  // ── 1. FRENTES ─────────────────────────────────────────────────────────────
  const frenteCols = await coda.listColumns(CODA_DOC, CODA_FRENTE_RUV);
  const fMap = buildColumnMap(frenteCols);
  const frenteRows = await coda.listRowsAll(CODA_DOC, CODA_FRENTE_RUV, { limit: 500 });
  const codaFrentes = frenteRows
    .map((r) => ({
      codaId: r.id,
      nombre: str(pick(r.values, fMap, 'Frente RUV')),
      idOferta: int(pick(r.values, fMap, 'ID Oferta')),
      idOrden: int(pick(r.values, fMap, 'ID Orden')),
      viviendas: int(pick(r.values, fMap, 'Viviendas en Oferta')),
    }))
    .filter((f) => f.nombre);

  const bsopFrentes = await readAll<{
    coda_id: string | null;
    nombre: string;
    id_oferta: number | null;
    id_orden: number | null;
    viviendas_oferta: number | null;
  }>((from, to) =>
    sb
      .schema('dilesa')
      .from('ruv_frentes')
      .select('coda_id, nombre, id_oferta, id_orden, viviendas_oferta')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .range(from, to)
  );
  const bsopFrentePorCoda = new Map(
    bsopFrentes.filter((f) => f.coda_id).map((f) => [f.coda_id!, f])
  );

  const frentesFaltan = codaFrentes.filter((f) => !bsopFrentePorCoda.has(f.codaId));
  const frentesDiff: string[] = [];
  for (const cf of codaFrentes) {
    const bf = bsopFrentePorCoda.get(cf.codaId);
    if (!bf) continue;
    if (norm(cf.nombre!) !== norm(bf.nombre))
      frentesDiff.push(`nombre: "${cf.nombre}" ≠ "${bf.nombre}"`);
    if ((cf.idOferta ?? null) !== (bf.id_oferta ?? null))
      frentesDiff.push(`${cf.nombre}: id_oferta ${cf.idOferta} ≠ ${bf.id_oferta}`);
    if ((cf.viviendas ?? null) !== (bf.viviendas_oferta ?? null))
      frentesDiff.push(`${cf.nombre}: viviendas ${cf.viviendas} ≠ ${bf.viviendas_oferta}`);
  }
  P('\n── 1. FRENTES ──────────────────────────────────────────────');
  P(`  Coda (con nombre): ${codaFrentes.length}  ·  BSOP: ${bsopFrentes.length}`);
  P(`  Frentes de Coda faltantes en BSOP: ${frentesFaltan.length}`);
  if (frentesFaltan.length) P('    → ' + frentesFaltan.map((f) => f.nombre).join(' | '));
  P(`  Diferencias de campos: ${frentesDiff.length}`);
  frentesDiff.slice(0, 20).forEach((d) => P('    • ' + d));

  // ── 2. CATÁLOGO DE DOCUMENTOS ───────────────────────────────────────────────
  const docCols = await coda.listColumns(CODA_DOC, CODA_DOCUMENTOS);
  const dMap = buildColumnMap(docCols);
  const docRows = await coda.listRowsAll(CODA_DOC, CODA_DOCUMENTOS, { limit: 500 });
  const codaDocs = new Set(
    docRows
      .map((r) => str(pick(r.values, dMap, 'Documento')))
      .filter((x): x is string => !!x)
      .map(norm)
  );
  const bsopDocsRows = await readAll<{ nombre: string }>((from, to) =>
    sb
      .schema('dilesa')
      .from('ruv_documentos_catalogo')
      .select('nombre')
      .eq('empresa_id', empresaId)
      .range(from, to)
  );
  const bsopDocs = new Set(bsopDocsRows.map((d) => norm(d.nombre)));
  const docsFaltan = [...codaDocs].filter((d) => !bsopDocs.has(d));
  const docsExtra = [...bsopDocs].filter((d) => !codaDocs.has(d));
  P('\n── 2. CATÁLOGO DE DOCUMENTOS ───────────────────────────────');
  P(`  Coda: ${codaDocs.size}  ·  BSOP: ${bsopDocs.size}`);
  P(
    `  En Coda y no en BSOP: ${docsFaltan.length}${docsFaltan.length ? ' → ' + docsFaltan.join(' | ') : ''}`
  );
  P(
    `  En BSOP y no en Coda: ${docsExtra.length}${docsExtra.length ? ' → ' + docsExtra.join(' | ') : ''}`
  );

  // ── 3. CUVs ─────────────────────────────────────────────────────────────────
  // Set de CUVs de Coda: tabla CUV plana + columna CUV de Inventario (válidos).
  const cuvRows = await coda.listRowsAll(CODA_DOC, CODA_CUV, { limit: 500 });
  const cuvColMap = buildColumnMap(await coda.listColumns(CODA_DOC, CODA_CUV));
  const invCols = await coda.listColumns(CODA_DOC, CODA_INVENTARIO);
  const iMap = buildColumnMap(invCols);
  const invRows = await coda.listRowsAll(CODA_DOC, CODA_INVENTARIO, { limit: 500 });

  const codaCuvSet = new Set<string>();
  for (const r of cuvRows) {
    const v = str(pick(r.values, cuvColMap, 'CUV')) ?? r.name;
    if (isCuv(v)) codaCuvSet.add(v!.trim());
  }
  for (const r of invRows) {
    const v = str(pick(r.values, iMap, 'CUV'));
    if (isCuv(v)) codaCuvSet.add(v!.trim());
  }

  const bsopUnidadesCuv = await readAll<{ cuv: string | null }>((from, to) =>
    sb
      .schema('dilesa')
      .from('unidades')
      .select('cuv')
      .eq('empresa_id', empresaId)
      .not('cuv', 'is', null)
      .range(from, to)
  );
  const bsopCuvSet = new Set(
    bsopUnidadesCuv
      .map((c) => str(c.cuv))
      .filter(isCuv)
      .map((c) => c!.trim())
  );

  const cuvFaltan = [...codaCuvSet].filter((c) => !bsopCuvSet.has(c));
  P('\n── 3. CUVs ─────────────────────────────────────────────────');
  P(
    `  CUVs válidos en Coda (CUV+Inventario): ${codaCuvSet.size}  ·  en BSOP (unidades.cuv): ${bsopCuvSet.size}`
  );
  P(`  CUVs en Coda y NO en BSOP: ${cuvFaltan.length}`);
  if (cuvFaltan.length) P('    → muestra: ' + cuvFaltan.slice(0, 15).join(', '));

  // ── 4. LOTES → FRENTE ───────────────────────────────────────────────────────
  // Coda Inventario: ID Lote → Frente RUV (texto).  BSOP: unidades.identificador → frente nombre.
  const bsopUnidades = await readAll<{ identificador: string | null; frente_id: string | null }>(
    (from, to) =>
      sb
        .schema('dilesa')
        .from('unidades')
        .select('identificador, frente_id')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null)
        .range(from, to)
  );
  const frenteNombrePorId = new Map(
    (
      await readAll<{ id: string; nombre: string }>((from, to) =>
        sb
          .schema('dilesa')
          .from('ruv_frentes')
          .select('id, nombre')
          .eq('empresa_id', empresaId)
          .range(from, to)
      )
    ).map((f) => [f.id, norm(f.nombre)])
  );
  const bsopLoteFrente = new Map<string, string | null>();
  for (const u of bsopUnidades) {
    const ident = str(u.identificador);
    if (ident)
      bsopLoteFrente.set(
        ident.trim().toUpperCase(),
        u.frente_id ? (frenteNombrePorId.get(u.frente_id) ?? null) : null
      );
  }

  let loteSinFrenteBsop = 0; // tiene frente en Coda, sin frente en BSOP
  let loteFrenteDistinto = 0; // frente distinto entre Coda y BSOP
  let loteSinUnidad = 0; // ID Lote de Coda sin unidad en BSOP
  let loteConFrenteCoda = 0;
  const ejemplosSinFrente: string[] = [];
  for (const r of invRows) {
    const frenteTexto = str(pick(r.values, iMap, 'Frente RUV'));
    if (!frenteTexto) continue;
    loteConFrenteCoda++;
    const idLote = str(pick(r.values, iMap, 'ID Lote'));
    if (!idLote) continue;
    const key = idLote.trim().toUpperCase();
    if (!bsopLoteFrente.has(key)) {
      loteSinUnidad++;
      continue;
    }
    const bsopFrente = bsopLoteFrente.get(key) ?? null;
    if (!bsopFrente) {
      loteSinFrenteBsop++;
      if (ejemplosSinFrente.length < 15) ejemplosSinFrente.push(`${idLote} (Coda: ${frenteTexto})`);
    } else if (bsopFrente !== norm(frenteTexto)) {
      loteFrenteDistinto++;
    }
  }
  P('\n── 4. LOTES → FRENTE ───────────────────────────────────────');
  P(`  Lotes con Frente RUV en Coda: ${loteConFrenteCoda}`);
  P(`  Sin frente en BSOP (debería tener): ${loteSinFrenteBsop}`);
  if (ejemplosSinFrente.length) P('    → ' + ejemplosSinFrente.join(' | '));
  P(`  Frente distinto Coda↔BSOP: ${loteFrenteDistinto}`);
  P(`  ID Lote de Coda sin unidad en BSOP: ${loteSinUnidad}`);

  // ── VEREDICTO ───────────────────────────────────────────────────────────────
  const ok =
    frentesFaltan.length === 0 &&
    frentesDiff.length === 0 &&
    docsFaltan.length === 0 &&
    cuvFaltan.length === 0 &&
    loteSinFrenteBsop === 0 &&
    loteFrenteDistinto === 0;
  P('\n══════════════════════════════════════════════════════════════');
  P(
    ok
      ? '  ✅ TODO COINCIDE — listo para cutoff de Coda'
      : '  ⚠️  HAY DISCREPANCIAS — revisar arriba antes del cutoff'
  );
  P('══════════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
