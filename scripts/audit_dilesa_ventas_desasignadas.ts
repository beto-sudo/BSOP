/**
 * audit_dilesa_ventas_desasignadas.ts
 *
 * Hotfix post-cutover (dilesa-ventas-expediente, 2026-06-11).
 *
 * En Coda la fila de venta se REUTILIZABA al reubicar a un cliente de unidad:
 * se llenaba `F📅Desasigna🚫` + `Motivo por el cual se libera inventario` +
 * `Inventario Desasignado` (la unidad liberada) y `Inventario` pasaba a la
 * unidad nueva — la venta seguía vigente. `import_dilesa_ventas.ts` marcó
 * `estado='desasignada'` con solo ver fecha en `F📅Desasigna🚫`, sin checar
 * si la fila aún tenía `Inventario` asignado, y dejó como desasignadas ventas
 * vigentes (ej. LUIS GERARDO ARIZPE LUNA, reubicado a M10-L34-LDLE).
 *
 * Regla de negocio (Beto, 2026-06-11): toda fila de Coda con `Inventario`
 * poblado al cutoff es una venta VIGENTE en esa unidad, tenga o no rastro de
 * desasignación — el rastro es histórico de la unidad anterior.
 *
 * Audit (default): clasifica las ventas `estado='desasignada'` de BSOP contra
 * la fila Coda correspondiente y reporta las falsas desasignadas, sin escribir.
 * Fix (FIX=1): además pasa a `estado='activa'` las falsas desasignadas cuya
 * unidad BSOP coincide con el `Inventario` de Coda y no tiene otra venta
 * activa en conflicto. `motivo_desasignacion` se conserva (histórico).
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/audit_dilesa_ventas_desasignadas.ts
 *   FIX=1 npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/audit_dilesa_ventas_desasignadas.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, dateStr } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const FIX = process.env.FIX === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';

// Filas que cumplen la regla pero NO se reactivan. La venta "ADALBERTO
// SANTOS PRUEBA" es un registro de prueba en Coda con inventario asignado;
// reactivarla ocuparía la unidad M9-L1-LDS con una venta ficticia.
const EXCLUIR_CODA_ROWS = new Set(['i-ML4sFse_UE']);

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Misma resolución que import_dilesa_ventas.ts: Coda agrega -{modelo}. */
function resolveUnidad(inv: string | null, unidadMap: Map<string, string>): string | null {
  if (!inv) return null;
  return unidadMap.get(inv) ?? unidadMap.get(inv.replace(/-[^-]+$/, '')) ?? null;
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

  // ── Coda: snapshot read-only de Clientes ────────────────────────────────────
  const cCols = await coda.listColumns(CODA_DOC, CODA_CLIENTES);
  const cm = buildColumnMap(cCols);
  const cRows = await coda.listRowsAll(CODA_DOC, CODA_CLIENTES);
  console.log(`Coda: ${cRows.length} filas en Clientes.`);

  type CodaVenta = {
    inv: string | null;
    invDesasignado: string | null;
    fechaDesasigna: string | null;
    motivo: string | null;
    fase: string | null;
  };
  const codaByRowId = new Map<string, CodaVenta>();
  for (const row of cRows) {
    const v = row.values;
    codaByRowId.set(row.id, {
      inv: str(pick(v, cm, 'Inventario')),
      invDesasignado: str(pick(v, cm, 'Inventario Desasignado')),
      fechaDesasigna: dateStr(pick(v, cm, 'F📅Desasigna🚫')),
      motivo: str(pick(v, cm, 'Motivo por el cual se libera inventario')),
      fase: str(pick(v, cm, 'Fase de Venta')),
    });
  }

  // ── BSOP: unidades + ventas de DILESA ───────────────────────────────────────
  const { data: unidades, error: uErr } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id, identificador, estado')
    .eq('empresa_id', empresaId);
  if (uErr) throw new Error(`Error leyendo unidades: ${uErr.message}`);
  const unidadMap = new Map(
    (unidades ?? []).map((u) => [u.identificador as string, u.id as string])
  );
  const unidadById = new Map(
    (unidades ?? []).map((u) => [
      u.id as string,
      { identificador: u.identificador as string, estado: u.estado as string },
    ])
  );

  type Venta = {
    id: string;
    coda_row_id: string | null;
    persona_id: string;
    unidad_id: string | null;
    estado: string;
    fase_actual: string | null;
    fase_posicion: number | null;
    motivo_desasignacion: string | null;
  };
  const ventas: Venta[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, coda_row_id, persona_id, unidad_id, estado, fase_actual, fase_posicion, motivo_desasignacion'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .range(from, from + 999);
    if (error) throw new Error(`SELECT ventas: ${error.message}`);
    ventas.push(...((data ?? []) as Venta[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  console.log(`BSOP: ${ventas.length} ventas activas+desasignadas (no borradas) de DILESA.`);

  // Nombres de personas (para el reporte) — en lote por IDs.
  const personaIds = [...new Set(ventas.map((v) => v.persona_id))];
  const nombreByPersona = new Map<string, string>();
  for (let i = 0; i < personaIds.length; i += 200) {
    const slice = personaIds.slice(i, i + 200);
    const { data, error } = await sb
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .in('id', slice);
    if (error) throw new Error(`SELECT personas: ${error.message}`);
    for (const p of data ?? []) {
      nombreByPersona.set(
        p.id as string,
        [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')
      );
    }
  }

  // Unidades con venta activa (para detectar conflictos al reactivar).
  const ventasActivasPorUnidad = new Map<string, Venta[]>();
  for (const v of ventas) {
    if (v.estado !== 'activa' || !v.unidad_id) continue;
    const arr = ventasActivasPorUnidad.get(v.unidad_id) ?? [];
    arr.push(v);
    ventasActivasPorUnidad.set(v.unidad_id, arr);
  }

  // ── Clasificación de las desasignadas ───────────────────────────────────────
  const desasignadas = ventas.filter((v) => v.estado === 'desasignada' && v.coda_row_id);
  const sinCodaRow = ventas.filter((v) => v.estado === 'desasignada' && !v.coda_row_id);

  type Caso = {
    venta_id: string;
    cliente: string;
    coda_row_id: string;
    coda_inventario: string;
    unidad_bsop: string;
    unidad_estado: string;
    fase: string;
    motivo: string;
    conflicto: string | null;
  };
  const corregibles: Caso[] = [];
  const conflictos: Caso[] = [];
  let realesDesasignadas = 0;
  let codaRowDesaparecida = 0;
  let unidadMismatch = 0;
  let excluidas = 0;

  for (const v of desasignadas) {
    if (EXCLUIR_CODA_ROWS.has(v.coda_row_id!)) {
      excluidas++;
      console.warn(
        `  ⚠ venta ${v.id} (${nombreByPersona.get(v.persona_id)}): en lista de exclusión — no se toca.`
      );
      continue;
    }
    const c = codaByRowId.get(v.coda_row_id!);
    if (!c) {
      codaRowDesaparecida++;
      console.warn(
        `  ⚠ venta ${v.id} (${nombreByPersona.get(v.persona_id)}): coda_row_id ${v.coda_row_id} ya no existe en Coda — revisar a mano.`
      );
      continue;
    }
    if (!c.inv) {
      realesDesasignadas++; // sin Inventario al cutoff → desasignada de verdad
      continue;
    }

    // Falsa desasignada: fila Coda con Inventario vigente.
    const unidadIdEsperada = resolveUnidad(c.inv, unidadMap);
    const u = v.unidad_id ? unidadById.get(v.unidad_id) : null;
    if (!unidadIdEsperada || unidadIdEsperada !== v.unidad_id) {
      unidadMismatch++;
      console.warn(
        `  ⚠ venta ${v.id} (${nombreByPersona.get(v.persona_id)}): Coda.Inventario="${c.inv}" no coincide con unidad BSOP ${u?.identificador ?? '(ninguna)'} — revisar a mano.`
      );
      continue;
    }

    const enConflicto = (ventasActivasPorUnidad.get(v.unidad_id!) ?? []).filter(
      (o) => o.id !== v.id
    );
    const caso: Caso = {
      venta_id: v.id,
      cliente: nombreByPersona.get(v.persona_id) ?? '(?)',
      coda_row_id: v.coda_row_id!,
      coda_inventario: c.inv,
      unidad_bsop: u?.identificador ?? '(?)',
      unidad_estado: u?.estado ?? '(?)',
      fase: `${v.fase_actual ?? c.fase ?? '?'} (${v.fase_posicion ?? '?'})`,
      motivo: v.motivo_desasignacion ?? c.motivo ?? '',
      conflicto: enConflicto.length
        ? enConflicto.map((o) => `${nombreByPersona.get(o.persona_id)} [${o.id}]`).join('; ')
        : null,
    };
    (caso.conflicto ? conflictos : corregibles).push(caso);
  }

  // ── Reporte ─────────────────────────────────────────────────────────────────
  console.log('\n=== Diagnóstico ventas desasignadas (BSOP vs Coda al cutoff) ===\n');
  console.log(`Desasignadas en BSOP (import Coda): ${desasignadas.length}`);
  console.log(`  reales (sin Inventario en Coda):   ${realesDesasignadas}`);
  console.log(`  FALSAS (Inventario vigente):       ${corregibles.length + conflictos.length}`);
  console.log(`    corregibles automático:          ${corregibles.length}`);
  console.log(`    con conflicto (revisar a mano):  ${conflictos.length}`);
  console.log(`  unidad mismatch (revisar a mano):  ${unidadMismatch}`);
  console.log(`  coda_row desaparecida:             ${codaRowDesaparecida}`);
  if (excluidas) console.log(`  excluidas (lista manual):          ${excluidas}`);
  if (sinCodaRow.length)
    console.log(`  desasignadas nativas BSOP (no se tocan): ${sinCodaRow.length}`);

  const fmt = (c: Caso) =>
    `  - ${c.cliente} · ${c.unidad_bsop} (unidad: ${c.unidad_estado}) · fase ${c.fase}\n` +
    `      motivo histórico: "${c.motivo}"${c.conflicto ? `\n      ⚠ CONFLICTO con venta activa: ${c.conflicto}` : ''}\n` +
    `      venta_id=${c.venta_id} coda_row=${c.coda_row_id}`;

  if (corregibles.length) {
    console.log(`\n— Corregibles (pasan a estado='activa'):\n${corregibles.map(fmt).join('\n')}`);
  }
  if (conflictos.length) {
    console.log(`\n— Con conflicto (NO se tocan en FIX):\n${conflictos.map(fmt).join('\n')}`);
  }

  if (!FIX) {
    console.log('\n(Solo auditoría — corre con FIX=1 para aplicar la corrección.)');
    return;
  }

  // ── FIX: reactivar las corregibles ──────────────────────────────────────────
  if (!corregibles.length) {
    console.log('\nNada que corregir.');
    return;
  }
  console.log(`\nAplicando fix a ${corregibles.length} ventas…`);
  let ok = 0;
  for (let i = 0; i < corregibles.length; i += 100) {
    const ids = corregibles.slice(i, i + 100).map((c) => c.venta_id);
    const { data, error } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({ estado: 'activa' })
      .in('id', ids)
      .eq('estado', 'desasignada') // guard: no pisar ediciones concurrentes
      .select('id');
    if (error) {
      console.error(`✗ chunk fix [${i}..${i + ids.length}): ${error.message}`);
      continue;
    }
    ok += data?.length ?? 0;
  }
  console.log(
    `✔ ${ok}/${corregibles.length} ventas reactivadas (estado='activa', motivo_desasignacion conservado).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
