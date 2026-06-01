/**
 * backfill_dilesa_desarrollo_tareas.ts
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` · Sprint 4 (espejar a
 * desarrollo). Instancia la plantilla canónica de tareas en los
 * desarrollos vivos que aún no tienen checklist, reusando la lógica
 * probada `instanciarPlantillaParaProyecto` (filtra por tipo →
 * `aplicacion IN ('desarrollo','ambas')`, calcula fechas objetivo en
 * cascada con calendario hábil MX, crea dependencias).
 *
 * Contexto: los 8 desarrollos vivos arrancaron antes del checklist y
 * tienen `tareas=0`. Beto pidió backfill masivo (en vez de poblar
 * on-demand). En el UI, el banner "Marcar histórico" del detalle del
 * desarrollo permite cerrar en bloque las tareas ya superadas.
 *
 * Idempotente: `instanciarPlantillaParaProyecto` rechaza un proyecto que
 * ya tenga tareas con `plantilla_tarea_id`, así que re-correrlo no
 * duplica. Reversible: las tareas se soft-deletean (`deleted_at`).
 *
 * Fecha de arranque por desarrollo: su `fecha_inicio`; si es null, hoy.
 *
 * Prerequisites (env): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_desarrollo_tareas.ts
 *   npx tsx scripts/backfill_dilesa_desarrollo_tareas.ts
 */

import { createClient } from '@supabase/supabase-js';
import { instanciarPlantillaParaProyecto } from '../lib/dilesa/instanciar-plantilla';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const hoyIso = new Date().toISOString().slice(0, 10);

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Desarrollos vivos (todo lo que NO es anteproyecto). El detalle de
  // proyecto monta <ProyectoDetalle> para estos tipos.
  const { data: proyectos, error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre, tipo, estado, fecha_inicio')
    .neq('tipo', 'anteproyecto')
    .is('deleted_at', null)
    .order('nombre');
  if (error) throw new Error(`No se pudieron leer los proyectos: ${error.message}`);

  const lista = proyectos ?? [];
  console.log(`\n${lista.length} proyectos no-anteproyecto vivos.\n`);

  let poblados = 0;
  let saltados = 0;
  let errores = 0;

  for (const p of lista) {
    const fecha = (p.fecha_inicio as string | null) ?? hoyIso;

    // Pre-check de idempotencia: ¿ya tiene tareas de plantilla?
    const { count } = await supabase
      .schema('dilesa')
      .from('proyecto_tareas')
      .select('id', { count: 'exact', head: true })
      .eq('proyecto_id', p.id)
      .not('plantilla_tarea_id', 'is', null)
      .is('deleted_at', null);

    if ((count ?? 0) > 0) {
      console.log(`  ⏭  ${p.nombre} (${p.tipo}) — ya tiene ${count} tareas, salto.`);
      saltados++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  · ${p.nombre} (${p.tipo}, estado=${p.estado}) — poblaría desde ${fecha}`);
      continue;
    }

    const r = await instanciarPlantillaParaProyecto(supabase, p.id as string, fecha);
    if (!r.ok) {
      console.log(`  ✖  ${p.nombre} — ${r.error}`);
      errores++;
    } else {
      console.log(`  ✓  ${p.nombre} — ${r.tareasCreadas} tareas instanciadas (arranque ${fecha})`);
      poblados++;
    }
  }

  console.log(
    `\n${DRY_RUN ? '[DRY_RUN] ' : ''}Resumen: ${poblados} poblados, ${saltados} saltados (ya tenían), ${errores} con error.\n`
  );
  if (errores > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
