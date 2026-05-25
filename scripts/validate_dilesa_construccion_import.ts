/**
 * validate_dilesa_construccion_import.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — validación post-import.
 *
 * Reporta:
 *   1. Conteos de filas por tabla del módulo construcción.
 *   2. Conteo de contratistas en erp.personas.
 *   3. Productos donde SUM(porcentaje_costo) no está entre 0.95 y 1.05
 *      (sospechosos de plantilla incompleta).
 *   4. 3 construcciones al azar con su avance_pct calculado (para que
 *      Beto compare manualmente contra Coda).
 *
 * Uso:
 *   npx tsx scripts/validate_dilesa_construccion_import.ts
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');
if (!SUPABASE_DB_URL) throw new Error('Falta SUPABASE_DB_URL');

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró la empresa DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  const pg = new Client({ connectionString: SUPABASE_DB_URL });
  await pg.connect();

  try {
    console.log('═══════ Conteos por tabla ═══════');
    const tables = [
      'etapas_construccion',
      'tareas_construccion',
      'plantilla_tareas',
      'contratistas_datos',
      'contratos_construccion',
      'contrato_lotes',
      'construccion',
      'construccion_tareas_terminadas',
    ];
    for (const t of tables) {
      const { rows } = await pg.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM dilesa.${t} WHERE empresa_id = $1 AND deleted_at IS NULL`,
        [empresaId]
      );
      console.log(`  ${t.padEnd(35)} ${rows[0].n.padStart(8)}`);
    }

    const { rows: personasRows } = await pg.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM erp.personas WHERE empresa_id = $1 AND tipo='contratista' AND deleted_at IS NULL`,
      [empresaId]
    );
    console.log(`  erp.personas (contratistas)         ${personasRows[0].n.padStart(8)}`);

    console.log('\n═══════ Plantilla — productos con SUM(%) fuera de [0.95, 1.05] ═══════');
    const { rows: bad } = await pg.query<{ nombre: string; suma: string; n_tareas: string }>(
      `SELECT p.nombre, ROUND(SUM(pt.porcentaje_costo)::numeric, 4)::text AS suma, COUNT(*)::text AS n_tareas
         FROM dilesa.plantilla_tareas pt
         JOIN dilesa.productos p ON p.id = pt.producto_id
        WHERE pt.empresa_id = $1 AND pt.deleted_at IS NULL
        GROUP BY p.nombre
       HAVING SUM(pt.porcentaje_costo) NOT BETWEEN 0.95 AND 1.05
        ORDER BY p.nombre`,
      [empresaId]
    );
    if (bad.length === 0) {
      console.log('  ✔ Todos los productos suman cerca de 100%.');
    } else {
      for (const r of bad) {
        console.log(`  ⚠ ${r.nombre.padEnd(20)} suma=${r.suma}  n_tareas=${r.n_tareas}`);
      }
    }

    console.log('\n═══════ Sample 3 construcciones (compare con Coda) ═══════');
    const { rows: muestras } = await pg.query<{
      codigo: string;
      avance_pct: string;
      tareas_terminadas: string;
      estado: string;
    }>(
      `SELECT c.codigo, c.avance_pct::text, c.estado,
              (SELECT COUNT(*)::text FROM dilesa.construccion_tareas_terminadas ctt
                 WHERE ctt.construccion_id = c.id AND ctt.deleted_at IS NULL) AS tareas_terminadas
         FROM dilesa.construccion c
        WHERE c.empresa_id = $1 AND c.deleted_at IS NULL
        ORDER BY random()
        LIMIT 3`,
      [empresaId]
    );
    for (const r of muestras) {
      console.log(
        `  ${r.codigo.padEnd(30)} avance=${r.avance_pct.padStart(6)}%  tareas=${r.tareas_terminadas.padStart(4)}  estado=${r.estado}`
      );
    }

    console.log('\n═══════ Suma de filas — sanidad ═══════');
    const { rows: total_construccion } = await pg.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM dilesa.construccion WHERE empresa_id = $1`,
      [empresaId]
    );
    const { rows: total_tareas } = await pg.query<{ n: string; sum_pct: string }>(
      `SELECT COUNT(*)::text AS n, ROUND(AVG(avance_pct)::numeric, 1)::text AS sum_pct
         FROM dilesa.construccion WHERE empresa_id = $1 AND deleted_at IS NULL`,
      [empresaId]
    );
    console.log(`  Total construcciones (con deleted): ${total_construccion[0].n}`);
    console.log(`  Avance% promedio: ${total_tareas[0].sum_pct}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
