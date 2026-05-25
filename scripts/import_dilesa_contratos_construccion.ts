/**
 * import_dilesa_contratos_construccion.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — Script C.
 * Importa contratos de construcción desde Coda DILESA (doc ZNxWl_DI2D,
 * tabla grid-OWReJ19erT "Contrato de Construcción") hacia
 * dilesa.contratos_construccion.
 *
 * NO popula contrato_lotes (la N:M con construccion) — eso es trabajo del
 * Script D, que requiere `dilesa.construccion` ya importada para resolver
 * la FK. Por eso este script guarda el CSV "ID Construcción" en la
 * columna `notas` de cada contrato con el prefijo `CODA_CSV:` que el
 * Script D parsea y limpia.
 *
 * FKs resueltas por nombre:
 *   - contratista_id ← erp.personas.nombre WHERE tipo='contratista'
 *   - proyecto_id    ← dilesa.proyectos.nombre WHERE tipo='desarrollo'
 *
 * Idempotente: UPSERT por (empresa_id, coda_row_id).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_contratos_construccion.ts
 *   npx tsx scripts/import_dilesa_contratos_construccion.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, dateStr, firstUrl } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_CONTRATOS = 'grid-OWReJ19erT';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

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

  const cCols = await coda.listColumns(CODA_DOC, T_CONTRATOS);
  const cm = buildColumnMap(cCols);
  const cRows = await coda.listRowsAll(CODA_DOC, T_CONTRATOS);
  console.log(`Coda: ${cRows.length} contratos.`);

  // ── Lookup contratistas: nombre → persona.id ───────────────────────────────
  const { data: contratistas, error: cErr } = await sb
    .schema('erp')
    .from('personas')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'contratista');
  if (cErr) throw new Error(`Error leyendo contratistas: ${cErr.message}`);
  const contratistaPorNombre = new Map(
    (contratistas ?? []).map((c) => [(c.nombre as string).trim().toLowerCase(), c.id as string])
  );

  // ── Lookup proyectos: nombre → proyecto.id (solo desarrollos) ─────────────
  const { data: proyectos, error: pErr } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre, tipo')
    .eq('empresa_id', empresaId);
  if (pErr) throw new Error(`Error leyendo proyectos: ${pErr.message}`);
  const proyectoPorNombre = new Map<string, string>();
  for (const p of proyectos ?? []) {
    if ((p.tipo as string) === 'desarrollo') {
      proyectoPorNombre.set((p.nombre as string).trim().toLowerCase(), p.id as string);
    }
  }

  let skipContratista = 0;
  let skipProyecto = 0;
  let skipSinFecha = 0;
  const inserts: Array<Record<string, unknown>> = [];

  for (const row of cRows) {
    const v = row.values;
    const codigo = str(pick(v, cm, 'ID Contrato Construcción')) ?? row.name;
    if (!codigo) continue;

    const contratistaNombre = str(pick(v, cm, 'Contratista'));
    const contratista_id = contratistaNombre
      ? contratistaPorNombre.get(contratistaNombre.trim().toLowerCase())
      : undefined;
    if (!contratista_id) {
      console.warn(`  ⚠ contrato "${codigo}": contratista "${contratistaNombre}" no encontrado`);
      skipContratista++;
      continue;
    }

    const fechaContrato = dateStr(pick(v, cm, 'Fecha Contrato'));
    if (!fechaContrato) {
      console.warn(`  ⚠ contrato "${codigo}": sin fecha_contrato — skip`);
      skipSinFecha++;
      continue;
    }

    const proyectoNombre = str(pick(v, cm, 'Fraccionamiento'));
    const proyecto_id = proyectoNombre
      ? proyectoPorNombre.get(proyectoNombre.trim().toLowerCase())
      : null;
    if (proyectoNombre && !proyecto_id) {
      console.warn(`  ⚠ contrato "${codigo}": proyecto "${proyectoNombre}" no encontrado`);
      skipProyecto++;
      // Continuamos — proyecto_id es nullable; el contrato se inserta sin ese FK.
    }

    const idConstruccionCsv = str(pick(v, cm, 'ID Construcción'));
    // Guardamos el CSV en `notas` con prefijo para que el Script D lo consuma
    // y limpie. Si Coda tenía notas reales (no es el caso de esta tabla),
    // las preservaríamos — aquí Coda no tiene columna `Notas` en contratos,
    // así que `notas` está libre.
    const notas = idConstruccionCsv ? `CODA_CSV:${idConstruccionCsv}` : null;

    inserts.push({
      empresa_id: empresaId,
      coda_row_id: row.id,
      codigo,
      fecha_contrato: fechaContrato,
      contratista_id,
      proyecto_id: proyecto_id ?? null,
      valor_total: num(pick(v, cm, 'Valor del Contrato')) ?? 0,
      fianzas_url: firstUrl(pick(v, cm, 'Fianzas')),
      notas,
    });
  }

  console.log(
    `  ${inserts.length} contratos a importar (skip contratista:${skipContratista} proyecto:${skipProyecto} sin-fecha:${skipSinFecha})`
  );

  if (DRY_RUN) {
    console.log('[DRY] no se escribe nada.');
    return;
  }

  let ok = 0;
  let err = 0;
  const CHUNK = 200;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { error } = await sb
      .schema('dilesa')
      .from('contratos_construccion')
      .upsert(chunk, { onConflict: 'empresa_id,coda_row_id' });
    if (error) {
      console.error(`  ✗ chunk [${i}..${i + chunk.length}): ${error.message}`);
      err += chunk.length;
      continue;
    }
    ok += chunk.length;
  }

  console.log(`  ✔ ${ok} contratos UPSERT (${err} errores).`);
  console.log('\n✔ Script C (contratos) terminado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
