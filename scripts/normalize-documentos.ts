/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js tipa solo `public`; para leer/escribir en `erp` usamos `as any`
 * (mismo patrón que el resto de scripts de mantenimiento).
 */
/**
 * normalize-documentos.ts
 *
 * Script one-shot (idempotente) para limpiar dos dimensiones del módulo
 * de documentos que quedaron inconsistentes del data histórico:
 *
 *   1. `erp.documentos.tipo` — formulario viejo dejaba elegir cualquier
 *      texto. Terminamos con 29 variantes distintas ("Compra-Venta",
 *      "Sub-Division", "Rcononcimiento de Adeudo", etc.) cuando en
 *      realidad todos son escrituras notariales.
 *
 *      Regla acordada: todo doc cuyo tipo NO sea Acta Constitutiva,
 *      Poder o Seguro pasa a `tipo='Escritura'`. La naturaleza específica
 *      (compraventa, subdivision, cancelación de reserva de dominio,
 *      protocolización de acta de asamblea, etc.) ya vive en
 *      `tipo_operacion` — poblada por la extracción IA.
 *
 *   2. `erp.personas.nombre` y `erp.documentos.notaria` — todos los
 *      notarios se capturaron en minúsculas ("lic. guillermo lopez
 *      elizondo"). Aplicamos Title Case según convenciones RAE:
 *      preposiciones/artículos (de, del, la) en minúscula, abreviaturas
 *      comunes (Lic., Dra., Ma.) y siglas (IMSS) con mayúscula propia.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/normalize-documentos.ts     # preview
 *   npx tsx scripts/normalize-documentos.ts               # aplica
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL      (requerido)
 *   SUPABASE_SERVICE_ROLE_KEY     (requerido — bypassa RLS)
 *   DRY_RUN=1                     no escribe a DB, solo reporta
 *   EMPRESA_ID=<uuid>             limita a una empresa
 */

import { createClient } from '@supabase/supabase-js';

import { titleCaseEs } from '../lib/documentos/text-normalize';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const EMPRESA_ID = process.env.EMPRESA_ID ?? null;

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tipos que se CONSERVAN como están. Todo lo demás pasa a 'Escritura'.
const TIPOS_CONSERVAR = new Set(['Acta Constitutiva', 'Poder', 'Seguro', 'Escritura', 'Otro']);

// ─── 1. Normalizar tipos ─────────────────────────────────────────────────────

async function normalizarTipos(): Promise<{ before: number; changed: number }> {
  console.log('');
  console.log('─── 1. Normalizando tipos de documento ─────────────────────────');

  let q = (supabase.schema('erp') as any)
    .from('documentos')
    .select('id, titulo, tipo, tipo_operacion')
    .is('deleted_at', null);
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);

  const { data: docs, error } = await q;
  if (error) throw new Error(`fetch documentos: ${error.message}`);

  const toUpdate = (docs ?? []).filter(
    (d: any) => d.tipo && !TIPOS_CONSERVAR.has(d.tipo as string)
  );

  console.log(`Total docs: ${docs?.length ?? 0}`);
  console.log(`A reclasificar como "Escritura": ${toUpdate.length}`);

  if (toUpdate.length > 0) {
    // Mostramos la distribución de tipos que se van a sobrescribir
    const tipoCounts = new Map<string, number>();
    for (const d of toUpdate) {
      tipoCounts.set(d.tipo, (tipoCounts.get(d.tipo) ?? 0) + 1);
    }
    console.log('\nDistribución de tipos a cambiar:');
    for (const [tipo, n] of [...tipoCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(3)} × "${tipo}"`);
    }
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY_RUN — no se escribe nada.');
    return { before: docs?.length ?? 0, changed: toUpdate.length };
  }

  if (toUpdate.length === 0) {
    console.log('Nada que cambiar.');
    return { before: docs?.length ?? 0, changed: 0 };
  }

  const ids = toUpdate.map((d: any) => d.id);
  const { error: upErr } = await (supabase.schema('erp') as any)
    .from('documentos')
    .update({ tipo: 'Escritura', updated_at: new Date().toISOString() })
    .in('id', ids);

  if (upErr) throw new Error(`update tipos: ${upErr.message}`);
  console.log(`✓ Actualizados ${ids.length} docs a tipo='Escritura'.`);
  return { before: docs?.length ?? 0, changed: ids.length };
}

// ─── 2. Normalizar nombres de notarios ───────────────────────────────────────

async function normalizarNotarios(): Promise<{ personas: number; documentos: number }> {
  console.log('');
  console.log('─── 2. Normalizando nombres de notarios ─────────────────────────');

  // 2a) erp.personas (fuente de verdad): solo las ligadas como notaría.
  const { data: personas, error: persErr } = await (supabase.schema('erp') as any)
    .from('personas')
    .select('id, nombre, proveedores:proveedores!inner(id, categoria)')
    .eq('proveedores.categoria', 'notaria')
    .eq('proveedores.activo', true)
    .is('deleted_at', null);

  if (persErr) {
    // Fallback si el embed no funciona — hacemos join manual.
    console.log(`(embed falló, usando join manual: ${persErr.message})`);
    const { data: provs, error: provErr } = await (supabase.schema('erp') as any)
      .from('proveedores')
      .select('persona_id')
      .eq('categoria', 'notaria')
      .eq('activo', true)
      .is('deleted_at', null);
    if (provErr) throw new Error(`fetch proveedores: ${provErr.message}`);
    const personaIds = [...new Set((provs ?? []).map((p: any) => p.persona_id))];
    const { data: ps, error: psErr } = await (supabase.schema('erp') as any)
      .from('personas')
      .select('id, nombre')
      .in('id', personaIds)
      .is('deleted_at', null);
    if (psErr) throw new Error(`fetch personas: ${psErr.message}`);
    return await applyPersonaChanges(ps ?? []);
  }

  return await applyPersonaChanges(personas ?? []);
}

async function applyPersonaChanges(
  personas: Array<{ id: string; nombre: string }>
): Promise<{ personas: number; documentos: number }> {
  const changes: Array<{ id: string; antes: string; despues: string }> = [];
  for (const p of personas) {
    const normalizado = titleCaseEs(p.nombre);
    if (normalizado && normalizado !== p.nombre) {
      changes.push({ id: p.id, antes: p.nombre, despues: normalizado });
    }
  }

  console.log(`Notarios revisados: ${personas.length}`);
  console.log(`Requieren normalización: ${changes.length}`);
  if (changes.length > 0) {
    console.log('\nCambios propuestos:');
    for (const c of changes) {
      console.log(`  "${c.antes}"\n    → "${c.despues}"`);
    }
  }

  // 2b) erp.documentos.notaria (texto libre, duplicado del nombre del notario
  //     cacheado al momento de asignarlo). Lo recorremos independiente.
  let q = (supabase.schema('erp') as any)
    .from('documentos')
    .select('id, notaria')
    .not('notaria', 'is', null)
    .is('deleted_at', null);
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);

  const { data: docs, error: docErr } = await q;
  if (docErr) throw new Error(`fetch documentos.notaria: ${docErr.message}`);

  const docChanges: Array<{ id: string; antes: string; despues: string }> = [];
  for (const d of docs ?? []) {
    const normalizado = titleCaseEs(d.notaria);
    if (normalizado && normalizado !== d.notaria) {
      docChanges.push({ id: d.id, antes: d.notaria, despues: normalizado });
    }
  }

  console.log(`\nDocumentos con notaria string: ${docs?.length ?? 0}`);
  console.log(`Requieren normalización: ${docChanges.length}`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY_RUN — no se escribe nada.');
    return { personas: changes.length, documentos: docChanges.length };
  }

  // Aplicar cambios en personas
  for (const c of changes) {
    const { error: uErr } = await (supabase.schema('erp') as any)
      .from('personas')
      .update({ nombre: c.despues, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (uErr) {
      console.error(`  ✗ persona ${c.id}: ${uErr.message}`);
    }
  }
  console.log(`✓ Actualizadas ${changes.length} personas (notarios).`);

  // Aplicar cambios en documentos.notaria
  for (const c of docChanges) {
    const { error: uErr } = await (supabase.schema('erp') as any)
      .from('documentos')
      .update({ notaria: c.despues, updated_at: new Date().toISOString() })
      .eq('id', c.id);
    if (uErr) {
      console.error(`  ✗ doc ${c.id}: ${uErr.message}`);
    }
  }
  console.log(`✓ Actualizados ${docChanges.length} documentos (campo notaria).`);

  return { personas: changes.length, documentos: docChanges.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('─────────────────────────────────────────────────────');
  console.log(' normalize-documentos');
  console.log('─────────────────────────────────────────────────────');
  console.log(` DRY_RUN     = ${DRY_RUN}`);
  console.log(` EMPRESA_ID  = ${EMPRESA_ID ?? '(todas)'}`);

  const tipos = await normalizarTipos();
  const notarios = await normalizarNotarios();

  console.log('');
  console.log('─── Reporte ─────────────────────────────────────────');
  console.log(`Tipos cambiados:              ${tipos.changed}`);
  console.log(`Personas (notarios):          ${notarios.personas}`);
  console.log(`Documentos (campo notaria):   ${notarios.documentos}`);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY_RUN=1 — no se escribió nada en la DB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
