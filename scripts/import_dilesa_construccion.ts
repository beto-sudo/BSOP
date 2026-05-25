/**
 * import_dilesa_construccion.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — Script D.
 * Importa el pivot central desde Coda DILESA (doc ZNxWl_DI2D, tabla
 * grid-CkajhVirlg "Construcción por Lote") hacia dilesa.construccion.
 * Luego popula dilesa.contrato_lotes consumiendo los CSVs de
 * contratos_construccion.notas que dejó el Script C.
 *
 * Lookups:
 *   - unidad_id      ← dilesa.unidades.identificador = Coda "ID Inventario"
 *                       (M13-L1-LDS-RMA). Si no encuentra, SKIP + reporta.
 *   - producto_id    ← dilesa.productos.nombre = Coda "Prototipo".
 *   - contratista_id ← erp.personas.nombre WHERE tipo='contratista'.
 *   - supervisor     ← erp.personas.nombre (cualquier tipo). Opcional.
 *
 * UNIQUE construccion_unidad_uk: solo 1 obra por unidad. Si Coda trae
 * >1 (lote re-arrancado), la más reciente (por fecha_arranque DESC)
 * gana; las viejas quedan estado='cancelada' + nota explicativa.
 *
 * Después de importar construcción, parsea cada contrato.notas con
 * prefijo `CODA_CSV:M13-L1-LDS-RMA-MAYA,...` y crea las filas N:M en
 * contrato_lotes. Limpia el prefijo al final.
 *
 * Idempotente: UPSERT por (empresa_id, coda_row_id).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_construccion.ts
 *   npx tsx scripts/import_dilesa_construccion.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, dateStr } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_CONSTRUCCION = 'grid-CkajhVirlg';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Estado inferido según el "más avanzado" de los marcadores de fecha. */
function inferEstado(f: {
  fecha_arranque: string | null;
  fecha_terminada: string | null;
  fecha_dtu: string | null;
  fecha_seguro_calidad: string | null;
  fecha_extraccion: string | null;
}): 'arrancada' | 'en_progreso' | 'terminada' | 'dtu' | 'seguro_calidad' | 'extraida' {
  if (f.fecha_dtu) return 'dtu';
  if (f.fecha_seguro_calidad) return 'seguro_calidad';
  if (f.fecha_extraccion) return 'extraida';
  if (f.fecha_terminada) return 'terminada';
  if (f.fecha_arranque) return 'en_progreso';
  return 'arrancada';
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

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const { data: unidades, error: uErr } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id, identificador')
    .eq('empresa_id', empresaId);
  if (uErr) throw new Error(`Error leyendo unidades: ${uErr.message}`);
  const unidadPorIdentificador = new Map(
    (unidades ?? []).map((u) => [(u.identificador as string).trim(), u.id as string])
  );

  /**
   * El ID de Coda tiene formato `M13-L1-LDS-RMA-MAYA` (Manzana-Lote-Proyecto-
   * Prototipo-Calle) mientras que `dilesa.unidades.identificador` usa solo
   * las primeras 3 partes (`M13-L1-LDS`). Normalizamos antes del lookup.
   * Si después del prefijo no hay match, intentamos el ID Coda crudo (por
   * si en algún proyecto el formato ya está canonicalizado).
   */
  function lookupUnidad(idCoda: string): string | undefined {
    const cleaned = idCoda.trim();
    const parts = cleaned.split('-');
    if (parts.length >= 3) {
      const prefijo = parts.slice(0, 3).join('-');
      const hit = unidadPorIdentificador.get(prefijo);
      if (hit) return hit;
    }
    return unidadPorIdentificador.get(cleaned);
  }

  const { data: productos, error: prErr } = await sb
    .schema('dilesa')
    .from('productos')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  if (prErr) throw new Error(`Error leyendo productos: ${prErr.message}`);
  const productoPorNombre = new Map(
    (productos ?? []).map((p) => [(p.nombre as string).trim(), p.id as string])
  );

  const { data: personas, error: pErr } = await sb
    .schema('erp')
    .from('personas')
    .select('id, nombre, tipo')
    .eq('empresa_id', empresaId);
  if (pErr) throw new Error(`Error leyendo personas: ${pErr.message}`);
  const contratistaPorNombre = new Map<string, string>();
  const personaPorNombre = new Map<string, string>(); // cualquier tipo (supervisor)
  for (const p of personas ?? []) {
    if (!p.nombre) continue;
    const k = (p.nombre as string).trim().toLowerCase();
    if ((p.tipo as string) === 'contratista') contratistaPorNombre.set(k, p.id as string);
    personaPorNombre.set(k, p.id as string);
  }

  // ── Pull Coda ──────────────────────────────────────────────────────────────
  const cCols = await coda.listColumns(CODA_DOC, T_CONSTRUCCION);
  const cm = buildColumnMap(cCols);
  const cRows = await coda.listRowsAll(CODA_DOC, T_CONSTRUCCION);
  console.log(`Coda: ${cRows.length} filas en Construcción por Lote.`);

  // ── Parseo ────────────────────────────────────────────────────────────────
  let skipUnidad = 0;
  let skipProducto = 0;
  let skipContratista = 0;
  const skipUnidadCodes: string[] = [];

  type ParsedRow = {
    codaRowId: string;
    codigo: string;
    unidad_id: string;
    producto_id: string;
    contratista_id: string;
    supervisor_persona_id: string | null;
    fecha_arranque: string | null;
    fecha_compromiso_terminar: string | null;
    fecha_terminada: string | null;
    fecha_seguro_calidad: string | null;
    fecha_extraccion: string | null;
    fecha_paquete_ruv: string | null;
    fecha_dtu: string | null;
    cuv: string | null;
    frente_ruv: string | null;
    m2_construccion: number | null;
    precio_mo_x_m2: number | null;
    valor_contrato_mo: number | null;
    mo_ejecutado: number;
    estado: string;
    coda_id_contrato: string | null;
  };

  const parsed: ParsedRow[] = [];
  for (const row of cRows) {
    const v = row.values;
    const codigo = str(pick(v, cm, 'ID Construcción')) ?? row.name;
    if (!codigo) continue;

    const idInventario = str(pick(v, cm, 'ID Inventario'));
    const unidad_id = idInventario ? lookupUnidad(idInventario) : undefined;
    if (!unidad_id) {
      skipUnidad++;
      skipUnidadCodes.push(`${codigo} → ${idInventario}`);
      continue;
    }

    const prototipoNombre = str(pick(v, cm, 'Prototipo'));
    const producto_id = prototipoNombre ? productoPorNombre.get(prototipoNombre.trim()) : undefined;
    if (!producto_id) {
      console.warn(`  ⚠ ${codigo}: prototipo "${prototipoNombre}" no encontrado — skip`);
      skipProducto++;
      continue;
    }

    const contratistaNombre = str(pick(v, cm, 'Contratista'));
    const contratista_id = contratistaNombre
      ? contratistaPorNombre.get(contratistaNombre.trim().toLowerCase())
      : undefined;
    if (!contratista_id) {
      console.warn(`  ⚠ ${codigo}: contratista "${contratistaNombre}" no encontrado — skip`);
      skipContratista++;
      continue;
    }

    const supervisorNombre = str(pick(v, cm, 'Supervisor'));
    const supervisor_persona_id = supervisorNombre
      ? (personaPorNombre.get(supervisorNombre.trim().toLowerCase()) ?? null)
      : null;

    // Coda usa columnas con emojis: "Fecha de Arranque🚧", "Fecha Terminada🏁", etc.
    const fechas = {
      fecha_arranque: dateStr(pick(v, cm, 'Fecha de Arranque🚧')),
      fecha_compromiso_terminar: dateStr(pick(v, cm, 'Fecha Compromiso para Terminar')),
      fecha_terminada: dateStr(pick(v, cm, 'Fecha Terminada🏁')),
      fecha_seguro_calidad: dateStr(pick(v, cm, 'Fecha Seguro Calidad✅')),
      fecha_extraccion: dateStr(pick(v, cm, 'Fecha Extracción🔄')),
      fecha_paquete_ruv: dateStr(pick(v, cm, 'Fecha Paquete RUV📦')),
      fecha_dtu: dateStr(pick(v, cm, 'Fecha DTU🔴')),
    };

    parsed.push({
      codaRowId: row.id,
      codigo,
      unidad_id,
      producto_id,
      contratista_id,
      supervisor_persona_id,
      ...fechas,
      cuv: str(pick(v, cm, 'CUV')),
      frente_ruv: str(pick(v, cm, 'Frente RUV')),
      m2_construccion: num(pick(v, cm, 'M² de Construcción')),
      precio_mo_x_m2: num(pick(v, cm, 'Precio MO x M²')),
      valor_contrato_mo: num(pick(v, cm, 'Valor Contrato MO')),
      mo_ejecutado: num(pick(v, cm, 'MO Ejecutado')) ?? 0,
      estado: inferEstado({
        fecha_arranque: fechas.fecha_arranque,
        fecha_terminada: fechas.fecha_terminada,
        fecha_dtu: fechas.fecha_dtu,
        fecha_seguro_calidad: fechas.fecha_seguro_calidad,
        fecha_extraccion: fechas.fecha_extraccion,
      }),
      coda_id_contrato: str(pick(v, cm, 'ID Contrato Construcción')),
    });
  }

  console.log(
    `  ${parsed.length} construcciones a importar (skip unidad:${skipUnidad}, producto:${skipProducto}, contratista:${skipContratista})`
  );

  // ── Manejo de UNIQUE construccion_unidad_uk: si una unidad tiene >1, gana
  // la más reciente (fecha_arranque DESC); las viejas → estado='cancelada'. ──
  const porUnidad = new Map<string, ParsedRow[]>();
  for (const r of parsed) {
    const arr = porUnidad.get(r.unidad_id) ?? [];
    arr.push(r);
    porUnidad.set(r.unidad_id, arr);
  }
  let reArrancadas = 0;
  const finales: ParsedRow[] = [];
  for (const [, arr] of porUnidad) {
    if (arr.length === 1) {
      finales.push(arr[0]);
      continue;
    }
    // Ordenar por fecha_arranque DESC (null al final)
    arr.sort((a, b) => {
      const da = a.fecha_arranque ? Date.parse(a.fecha_arranque) : 0;
      const db = b.fecha_arranque ? Date.parse(b.fecha_arranque) : 0;
      return db - da;
    });
    const ganador = arr[0];
    finales.push(ganador);
    for (let i = 1; i < arr.length; i++) {
      reArrancadas++;
      finales.push({
        ...arr[i],
        estado: 'cancelada',
      });
      // Las canceladas pasan, pero con estado="cancelada" — la UNIQUE constraint
      // sigue exigiendo solo 1 fila no-deleted por unidad; en BSOP la UNIQUE es
      // (unidad_id) DEFERRABLE INITIALLY DEFERRED. Las "canceladas" igual
      // ocupan unidad — necesitamos soft-delete o asignar deleted_at para que
      // el INDEX parcial las ignore... pero la constraint es UNIQUE estricta,
      // no partial.
      // Mejor: las canceladas NO se importan, solo reportamos.
    }
  }
  // Política: NO importar canceladas para evitar el conflicto con UNIQUE.
  // Solo reportarlas como contexto.
  const finalesSinCanceladas = finales.filter((r) => r.estado !== 'cancelada');
  if (reArrancadas > 0) {
    console.log(
      `  ⚠ ${reArrancadas} construcciones viejas (re-arrancadas) omitidas — solo se importa la más reciente por unidad.`
    );
  }
  console.log(`  ${finalesSinCanceladas.length} construcciones tras dedup por unidad.`);

  if (skipUnidadCodes.length > 0) {
    const muestra = skipUnidadCodes.slice(0, 10);
    console.log(`  ⚠ Primeras ${muestra.length} con unidad sin match:`);
    for (const c of muestra) console.log(`    · ${c}`);
    if (skipUnidadCodes.length > 10) console.log(`    ... (+${skipUnidadCodes.length - 10} más)`);
  }

  if (DRY_RUN) {
    console.log('[DRY] no se escribe nada.');
    return;
  }

  // ── INSERT construcciones ─────────────────────────────────────────────────
  const inserts = finalesSinCanceladas.map((r) => ({
    empresa_id: empresaId,
    coda_row_id: r.codaRowId,
    codigo: r.codigo,
    unidad_id: r.unidad_id,
    producto_id: r.producto_id,
    contratista_id: r.contratista_id,
    supervisor_persona_id: r.supervisor_persona_id,
    fecha_arranque: r.fecha_arranque,
    fecha_compromiso_terminar: r.fecha_compromiso_terminar,
    fecha_terminada: r.fecha_terminada,
    fecha_seguro_calidad: r.fecha_seguro_calidad,
    fecha_extraccion: r.fecha_extraccion,
    fecha_paquete_ruv: r.fecha_paquete_ruv,
    fecha_dtu: r.fecha_dtu,
    cuv: r.cuv,
    frente_ruv: r.frente_ruv,
    m2_construccion: r.m2_construccion,
    precio_mo_x_m2: r.precio_mo_x_m2,
    valor_contrato_mo: r.valor_contrato_mo,
    mo_ejecutado: r.mo_ejecutado,
    estado: r.estado,
  }));

  let ok = 0;
  const codaRowIdToConstId = new Map<string, string>();
  const codigoToConstId = new Map<string, string>();
  const CHUNK = 200;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { data: ups, error } = await sb
      .schema('dilesa')
      .from('construccion')
      .upsert(chunk, { onConflict: 'empresa_id,coda_row_id' })
      .select('id, coda_row_id, codigo');
    if (error) {
      console.error(`  ✗ chunk [${i}..${i + chunk.length}): ${error.message}`);
      continue;
    }
    for (const u of ups ?? []) {
      codaRowIdToConstId.set(u.coda_row_id as string, u.id as string);
      codigoToConstId.set(u.codigo as string, u.id as string);
    }
    ok += chunk.length;
  }
  console.log(`  ✔ ${ok} construcciones UPSERT.`);

  // ── Popular contrato_lotes desde notas:CODA_CSV ───────────────────────────
  console.log('\n── Popular contrato_lotes desde contratos.notas:CODA_CSV ──');
  const { data: contratos, error: ctErr } = await sb
    .schema('dilesa')
    .from('contratos_construccion')
    .select('id, codigo, notas')
    .eq('empresa_id', empresaId)
    .like('notas', 'CODA_CSV:%');
  if (ctErr) throw new Error(`Error leyendo contratos: ${ctErr.message}`);
  console.log(`  ${contratos?.length ?? 0} contratos con CSV pendiente.`);

  let cl_ok = 0;
  let cl_skip = 0;
  const limpiezas: Array<{ id: string }> = [];

  for (const contrato of contratos ?? []) {
    const csv = ((contrato.notas as string) ?? '').replace(/^CODA_CSV:/, '');
    const codigos = csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const inserts: Array<Record<string, unknown>> = [];
    for (const codigo of codigos) {
      const const_id = codigoToConstId.get(codigo);
      if (!const_id) {
        // intentar lookup directo a DB (la construccion puede haber existido
        // de un run anterior y no estar en el map de este run).
        const { data: c2 } = await sb
          .schema('dilesa')
          .from('construccion')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('codigo', codigo)
          .maybeSingle();
        if (!c2) {
          cl_skip++;
          continue;
        }
        codigoToConstId.set(codigo, c2.id as string);
        inserts.push({
          empresa_id: empresaId,
          contrato_id: contrato.id as string,
          construccion_id: c2.id as string,
          coda_row_id: `${contrato.id}::${codigo}`,
        });
      } else {
        inserts.push({
          empresa_id: empresaId,
          contrato_id: contrato.id as string,
          construccion_id: const_id,
          coda_row_id: `${contrato.id}::${codigo}`,
        });
      }
    }
    if (inserts.length > 0) {
      const { error: clErr } = await sb
        .schema('dilesa')
        .from('contrato_lotes')
        .upsert(inserts, { onConflict: 'contrato_id,construccion_id' });
      if (clErr) {
        console.error(`  ✗ contrato_lotes contrato ${contrato.codigo}: ${clErr.message}`);
        continue;
      }
      cl_ok += inserts.length;
    }
    limpiezas.push({ id: contrato.id as string });
  }

  // Limpiar notas:CODA_CSV (ya consumido)
  let limpiosOk = 0;
  for (const l of limpiezas) {
    const { error } = await sb
      .schema('dilesa')
      .from('contratos_construccion')
      .update({ notas: null })
      .eq('id', l.id);
    if (!error) limpiosOk++;
  }

  console.log(
    `  ✔ ${cl_ok} contrato_lotes UPSERT (${cl_skip} skip por construccion no encontrada).`
  );
  console.log(`  ✔ ${limpiosOk}/${limpiezas.length} contratos.notas limpiados.`);

  console.log('\n✔ Script D (construccion + contrato_lotes) terminado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
