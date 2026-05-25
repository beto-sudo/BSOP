/**
 * Cleanup de prueba end-to-end del módulo Construcción.
 *
 * Borra todo lo creado por una corrida de prueba: contrato + N lotes +
 * sus construcciones + tareas terminadas + revierte unidad a estado
 * 'planeada' con producto_id=NULL.
 *
 * El trigger `tg_construccion_avance` regresa automáticamente la
 * unidad a `planeada` cuando se borran las tareas terminadas (avance
 * cae a 0 < 20%), pero aplicamos UPDATE explícito como red de seguridad
 * por si la unidad se quedó en otro estado.
 *
 * Uso:
 *   CONTRATO_ID=<uuid> npx tsx scripts/cleanup_prueba_construccion.ts
 *
 * Salida: reporta cuántas filas borró por tabla y el estado final de
 * las unidades afectadas. No commitea hasta que se confirme con --apply.
 *
 * Defaultea a DRY-RUN (solo reporta lo que haría). Para ejecutar real,
 * agregar `--apply`.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const CONTRATO_ID = process.env.CONTRATO_ID;
const APPLY = process.argv.includes('--apply');

if (!CONTRATO_ID) {
  console.error('Falta CONTRATO_ID. Uso:');
  console.error(
    '  CONTRATO_ID=<uuid> npx tsx scripts/cleanup_prueba_construccion.ts          # dry-run'
  );
  console.error(
    '  CONTRATO_ID=<uuid> npx tsx scripts/cleanup_prueba_construccion.ts --apply  # ejecutar'
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function main() {
  console.log(`\n${APPLY ? '⚠️  APPLY' : '🔍 DRY-RUN'} · cleanup del contrato ${CONTRATO_ID}\n`);

  // 1) Verificar que el contrato existe + traer datos
  const { data: contrato, error: cErr } = await sb
    .schema('dilesa')
    .from('contratos_construccion')
    .select('id, codigo, fecha_contrato, valor_total, contratista_id')
    .eq('id', CONTRATO_ID)
    .maybeSingle();
  if (cErr || !contrato) {
    console.error(`❌ Contrato ${CONTRATO_ID} no encontrado: ${cErr?.message ?? 'sin resultado'}`);
    process.exit(1);
  }
  console.log(`✓ Contrato encontrado: ${contrato.codigo}  ($${contrato.valor_total})`);

  // 2) Traer construcciones vinculadas (via contrato_lotes)
  const { data: lotes, error: lErr } = await sb
    .schema('dilesa')
    .from('contrato_lotes')
    .select('id, construccion_id')
    .eq('contrato_id', CONTRATO_ID);
  if (lErr) {
    console.error(`❌ Error trayendo contrato_lotes: ${lErr.message}`);
    process.exit(1);
  }
  const construccionIds = (lotes ?? []).map((l) => l.construccion_id);
  console.log(`✓ ${lotes?.length ?? 0} contrato_lotes · ${construccionIds.length} construcciones`);

  // 3) Traer las construcciones para saber qué unidades regresar a planeada
  const { data: construcciones } = await sb
    .schema('dilesa')
    .from('construccion')
    .select('id, codigo, unidad_id, producto_id, avance_pct, estado')
    .in('id', construccionIds.length ? construccionIds : ['00000000-0000-0000-0000-000000000000']);

  if (construcciones && construcciones.length > 0) {
    console.log(`✓ Construcciones a borrar:`);
    for (const c of construcciones) {
      console.log(`    ${c.codigo} · avance ${c.avance_pct}% · estado=${c.estado}`);
    }
  }

  const unidadIds = (construcciones ?? []).map((c) => c.unidad_id);

  // 4) Contar tareas terminadas a borrar
  const { count: tareasCount } = await sb
    .schema('dilesa')
    .from('construccion_tareas_terminadas')
    .select('id', { count: 'exact', head: true })
    .in(
      'construccion_id',
      construccionIds.length ? construccionIds : ['00000000-0000-0000-0000-000000000000']
    );
  console.log(`✓ ${tareasCount ?? 0} tareas_terminadas a borrar\n`);

  if (!APPLY) {
    console.log(`📋 Plan de ejecución (re-correr con --apply para aplicar):\n`);
    console.log(
      `  1. DELETE ${tareasCount ?? 0} construccion_tareas_terminadas WHERE construccion_id IN (...)`
    );
    console.log(`     → trigger tg_construccion_avance dispara: avance baja a 0%`);
    console.log(`     → trigger inverso: unidades pasan de 'en_construccion' a 'planeada'`);
    console.log(
      `  2. UPDATE ${unidadIds.length} unidades SET producto_id=NULL, estado='planeada' (red de seguridad)`
    );
    console.log(
      `  3. DELETE ${lotes?.length ?? 0} contrato_lotes WHERE contrato_id=${CONTRATO_ID}`
    );
    console.log(`  4. DELETE ${construccionIds.length} construccion WHERE id IN (...)`);
    console.log(`  5. DELETE 1 contratos_construccion WHERE id=${CONTRATO_ID}`);
    console.log(`\n  Las personas/contratistas/prototipos NO se tocan.\n`);
    process.exit(0);
  }

  // ── APPLY ──────────────────────────────────────────────────────────
  console.log(`▶ Ejecutando cleanup...\n`);

  // Paso 1: borrar tareas terminadas (trigger ajusta avance + estado)
  if (construccionIds.length > 0) {
    const { error: e1, count: deletedTareas } = await sb
      .schema('dilesa')
      .from('construccion_tareas_terminadas')
      .delete({ count: 'exact' })
      .in('construccion_id', construccionIds);
    if (e1) {
      console.error(`❌ Paso 1: ${e1.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${deletedTareas ?? 0} tareas_terminadas borradas`);
  }

  // Paso 2: UPDATE unidades como red de seguridad
  if (unidadIds.length > 0) {
    const { error: e2 } = await sb
      .schema('dilesa')
      .from('unidades')
      .update({ producto_id: null, estado: 'planeada' })
      .in('id', unidadIds);
    if (e2) {
      console.error(`❌ Paso 2: ${e2.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${unidadIds.length} unidades regresadas a planeada + producto_id=NULL`);
  }

  // Paso 3: contrato_lotes
  const { error: e3, count: deletedLotes } = await sb
    .schema('dilesa')
    .from('contrato_lotes')
    .delete({ count: 'exact' })
    .eq('contrato_id', CONTRATO_ID);
  if (e3) {
    console.error(`❌ Paso 3: ${e3.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${deletedLotes ?? 0} contrato_lotes borrados`);

  // Paso 4: construcciones
  if (construccionIds.length > 0) {
    const { error: e4, count: deletedConstr } = await sb
      .schema('dilesa')
      .from('construccion')
      .delete({ count: 'exact' })
      .in('id', construccionIds);
    if (e4) {
      console.error(`❌ Paso 4: ${e4.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${deletedConstr ?? 0} construcciones borradas`);
  }

  // Paso 5: contrato
  const { error: e5 } = await sb
    .schema('dilesa')
    .from('contratos_construccion')
    .delete()
    .eq('id', CONTRATO_ID);
  if (e5) {
    console.error(`❌ Paso 5: ${e5.message}`);
    process.exit(1);
  }
  console.log(`  ✓ 1 contrato borrado\n`);

  // Verificación final de unidades
  if (unidadIds.length > 0) {
    const { data: unidadesFinal } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('identificador, estado, producto_id')
      .in('id', unidadIds);
    console.log(`✓ Estado final de las unidades:`);
    for (const u of unidadesFinal ?? []) {
      console.log(
        `    ${u.identificador} · estado=${u.estado} · producto_id=${u.producto_id ?? 'NULL'}`
      );
    }
  }

  console.log(`\n✅ Cleanup completado. Sin huella.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
