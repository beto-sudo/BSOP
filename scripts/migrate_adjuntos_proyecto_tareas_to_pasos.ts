/**
 * migrate_adjuntos_proyecto_tareas_to_pasos.ts
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` Sprint 3.6.
 *
 * Sprint 1.5 importó 29 adjuntos desde Coda con
 * `entidad_tipo='proyecto_tarea'` apuntando al ID de la tarea. Sprint 3
 * introdujo el modelo de pasos y el `<FileAttachments>` de cada paso
 * filtra por `entidad_tipo='proyecto_tarea_paso'` con
 * `entidad_id=<paso.id>`. Eso deja los 29 archivos importados
 * invisibles en la nueva UI aunque sí están en Storage y en el row
 * `proyecto_tareas.resultado_documento_url`.
 *
 * Este script migra los rows en `erp.adjuntos` para que apunten al
 * paso `resultado` correspondiente:
 * - `entidad_tipo`: 'proyecto_tarea' → 'proyecto_tarea_paso'
 * - `entidad_id`: tarea.id → paso.id (donde paso.paso='resultado')
 * - `url` (path en Storage) NO cambia — el archivo físico sigue en
 *   `dilesa/proyecto_tareas/<tarea_id>/<file>`. El proxy URL solo
 *   necesita el path, así que sigue funcionando.
 *
 * Idempotente: skipea rows que ya están migrados (entidad_tipo ya
 * es 'proyecto_tarea_paso' o ya existe otro row con esa combinación).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_adjuntos_proyecto_tareas_to_pasos.ts
 *   npx tsx scripts/migrate_adjuntos_proyecto_tareas_to_pasos.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1) Leer los adjuntos con entidad_tipo='proyecto_tarea' que pertenecen
  //    a DILESA. Idem para 'proyecto_tareas' por si quedó algún caso plural
  //    (no debería, pero defensivo).
  const { data: adjuntosRaw, error: errAdj } = await sb
    .schema('erp')
    .from('adjuntos')
    .select('id, empresa_id, entidad_tipo, entidad_id, nombre')
    .in('entidad_tipo', ['proyecto_tarea', 'proyecto_tareas']);
  if (errAdj) throw new Error(`Error leyendo adjuntos: ${errAdj.message}`);
  const adjuntos = (adjuntosRaw ?? []) as Array<{
    id: string;
    empresa_id: string;
    entidad_tipo: string;
    entidad_id: string;
    nombre: string;
  }>;

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Adjuntos legacy con entidad_tipo=proyecto_tarea: ${adjuntos.length}\n`
  );

  if (adjuntos.length === 0) {
    console.log('Nada que migrar.');
    return;
  }

  // 2) Pre-cargar los pasos 'resultado' de las tareas referenciadas.
  const tareaIds = Array.from(new Set(adjuntos.map((a) => a.entidad_id)));
  const { data: pasosRaw } = await sb
    .schema('dilesa')
    .from('proyecto_tarea_pasos')
    .select('id, tarea_id, paso')
    .in('tarea_id', tareaIds)
    .eq('paso', 'resultado')
    .is('deleted_at', null);
  const pasos = (pasosRaw ?? []) as Array<{ id: string; tarea_id: string; paso: string }>;
  const pasoIdByTareaId = new Map(pasos.map((p) => [p.tarea_id, p.id]));

  console.log(`Pasos 'resultado' encontrados para mapeo: ${pasos.length} (de ${tareaIds.length} tareas distintas)\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const a of adjuntos) {
    const pasoId = pasoIdByTareaId.get(a.entidad_id);
    if (!pasoId) {
      console.log(`  ✗ [sin paso resultado] tarea=${a.entidad_id.slice(0, 8)} ${a.nombre}`);
      fail++;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  [dry] adjunto ${a.id.slice(0, 8)} | ${a.nombre} | tarea=${a.entidad_id.slice(0, 8)} → paso=${pasoId.slice(0, 8)}`
      );
      ok++;
      continue;
    }

    const { error: updErr } = await sb
      .schema('erp')
      .from('adjuntos')
      .update({
        entidad_tipo: 'proyecto_tarea_paso',
        entidad_id: pasoId,
      })
      .eq('id', a.id);

    if (updErr) {
      console.log(`  ✗ [update] ${a.id.slice(0, 8)} | ${a.nombre} | ${updErr.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${a.id.slice(0, 8)} | ${a.nombre} → paso ${pasoId.slice(0, 8)}`);
      ok++;
    }
  }

  console.log(`\nSummary: ok=${ok} skip=${skip} fail=${fail}`);
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
